'use strict';

const MQTT = require('mqtt');
const pify = require('pify');
const {EventEmitter2} = require('eventemitter2');

const eventify = topic => topic.replace(/#/g, '**').replace(/\+/g, '*');

const asyncMethodNames = ['publish', 'subscribe', 'unsubscribe', 'end'];

/**
 * Monkeypatches a `MqttClient` instance.
 * Promisifies `end`, `subscribe`, `publish`, and `unsubscribe`.
 * Adds special behavior around `on`, `once`, `removeListener`, `emit`, etc.
 * @param {MqttClient} client - MqttClient (does not mutate)
 * @returns {MqttClient} Patched client
 */
const toadpatch = client => {
  const asyncMethods = asyncMethodNames.reduce(
    (acc, name) => Object.assign(acc, {[name]: pify(client[name])}),
    {}
  );

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
   * @param {Function} listener - Listener function; called with  `message` and
   *   raw `packet`
   * @param {Object} [opts] - Any options for MQTT subscription
   * @param {number} [opts.qos=0] - QoS
   * @returns Promise<{{topic, qos}}> Object w/ topic subscribed to and QoS
   *   granted by broker
   */
  client.subscribe = async function toadSubscribe(topic, listener, opts = {}) {
    if (typeof topic !== 'string' || typeof listener !== 'function') {
      throw new TypeError('Invalid parameters');
    }

    const {toad} = this;
    const event = eventify(topic);
    toad.on(event, listener);

    // TODO: find a way to not subscribe to already-subscribed topics
    // TODO: note that a different QoS requires a new subscription
    // TODO: even if the topic is identical!
    try {
      const result = await asyncMethods.subscribe.call(this, topic, opts);
      return result.shift();
    } catch (err) {
      toad.removeListener(event, listener);
      throw err;
    }
  };

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
  client.unsubscribe = async function toadUnsubscribe(topic, listener) {
    const {toad} = this;
    const event = eventify(topic);
    toad.removeListener(event, listener);
    if (!toad.listenerCount(event)) {
      return asyncMethods.unsubscribe.call(this, topic);
    }
  };

  /**
   * Disconnects client (if connected)
   * @function
   * @public
   * @returns {Promise<void>}
   */
  client.end = async function toadEnd(force) {
    if (this.connected) {
      await asyncMethods.end.call(this, force);
      this.disconnecting = false;
    }
  };

  /**
   * Publishes a message to a topic
   * @function
   * @public
   * @returns {Promise<void>}
   */
  client.publish = asyncMethods.publish;

  /**
   * On any received message, delegate to the internal EE2 instance
   * where the real listeners for subscriptions are stored.
   */
  client.on('message', function(topic, message, packet) {
    this.toad.emit(eventify(topic), message, packet);
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
  return new Promise((resolve, reject) => {
    MQTT.connect(...args)
      .on('connect', function(connack) {
        /**
       * If `false`, this is a clean session
       * @public
       * @memberOf client
       */
        this.sessionPresent = Boolean(connack.sessionPresent);
      })
      .once('error', reject)
      .once('connect', function() {
        resolve(toadpatch(this));
      });
  });
};

exports.patch = toadpatch;
exports.Store = MQTT.Store;
