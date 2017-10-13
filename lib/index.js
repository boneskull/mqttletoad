'use strict';

const MQTT = require('mqtt');
const pify = require('pify');
const {EventEmitter2} = require('eventemitter2');

const eventify = topic => topic.replace(/#/g, '**').replace(/\+/g, '*');

/**
 * Monkeypatches a `MqttClient` instance.
 * Promisifies `end`, `subscribe`, `publish`, and `unsubscribe`.
 * Adds special behavior around `on`, `once`, `removeListener`, `emit`, etc.
 * @param {MqttClient} client - MqttClient (does not mutate)
 * @param {Object} connack - Connection acknowledgment object
 * @param {boolean} connack.sessionPresent - If true, not clean session
 * @returns {MqttClient} Patched client
 */
const toadpatch = (client, connack) => {
  const end = pify(client.end);
  const subscribe = pify(client.subscribe);
  const publish = pify(client.publish);
  const unsubscribe = pify(client.unsubscribe);

  Object.defineProperty(client, 'sessionPresent', {
    value: Boolean(connack.sessionPresent)
  });

  /**
   * Adapter between MQTT topics (supporting wildcards) and the client events.
   * @type {EventEmitter2}
   * @private
   */
  client.toad = new EventEmitter2({
    wildcard: true,
    delimiter: '/'
  });

  /**
   * Subscribe to a topic with a specific listener.
   * @public
   * @function
   * @param {string} topic - MQTT topic
   * @param {Buffer|string} message - MQTT messqage
   * @param {Function} listener - Listener function; called with  `message` and raw `packet`
   * @param {Object} [opts] - Any options for MQTT subscription
   * @param {number} [opts.qos=0] - QoS
   * @returns Promise<{{topic, qos}}> Object w/ topic subscribed to and QoS
   *   granted by broker
   */
  client.subscribe = new Proxy(subscribe, {
    async apply(target, client, [topic, listener, opts = {}]) {
      if (typeof topic !== 'string' || typeof listener !== 'function') {
        throw new TypeError('Invalid parameters');
      }

      const {toad} = client;
      const event = eventify(topic);
      toad.on(event, listener);

      // TODO: find a way to not subscribe to already-subscribed topics
      // TODO: note that a different QoS requires a new subscription
      // TODO: even if the topic is identical!
      try {
        const result = await target.apply(client, [topic, opts]);
        return result.shift();
      } catch (err) {
        toad.removeListener(event, listener);
        throw err;
      }
    }
  });

  /**
   * Topic must match exactly.
   * Only unsubscribes at broker level if no more listeners are registered for
   * the topic.
   * @public
   * @function
   * @param {string} topic - MQTT topic
   * @param {Function} listener - Listener function to remove
   * @returns {Promise<void>}
   */
  client.unsubscribe = new Proxy(unsubscribe, {
    async apply(target, client, [topic, listener]) {
      const {toad} = client;
      const event = eventify(topic);
      toad.removeListener(event, listener);
      if (!toad.listenerCount(event)) {
        return target.apply(client, topic);
      }
    }
  });

  /**
   * Disconnects client (if connected)
   * @function
   * @public
   * @returns {Promise<void>}
   */
  client.end = new Proxy(end, {
    async apply(target, client, ...args) {
      if (client.connected) {
        return target.apply(client, ...args);
      }
    }
  });

  /**
   * Publishes a message to a topic
   * @function
   * @returns {Promise<void>}
   */
  client.publish = new Proxy(publish, {
    async apply(target, client, ...args) {
      return target.apply(client, ...args);
    }
  });

  /**
   * On any received message, delegate to the internal EE2 instance
   * where the real listeners for subscriptions are stored.
   */
  client.on('message', (topic, message, packet) => {
    client.toad.emit(eventify(topic), message, packet);
  });

  return client;
};

/**
 * Accepts same parameters as `mqtt.connect`, except returns a `Promise`
 * which is fulfilled when the connection is made.
 * Returns a fancypants patched `MqttClient` instance.
 * @see https://www.npmjs.com/package/mqtt#connect
 * @returns {Promise<MqttClient>} Patched `MqttClient` instance
 */
exports.connect = (...args) => {
  const client = MQTT.connect(...args);
  return new Promise((resolve, reject) => {
    client.on('error', reject).on('connect', connack => {
      resolve(toadpatch(client, connack));
    });
  });
};

exports.patch = toadpatch;
exports.Store = MQTT.Store;
