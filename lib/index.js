'use strict';

const MQTT = require('mqtt');
const promisify = require('promwrap');
const net = require('net');
const {EventEmitter2} = require('eventemitter2');
const decoders = require('./decoders');
const encoders = require('./encoders');

const DEFAULT_OPTS = {decoder: decoders.text, encoder: encoders.text};

const eventify = topic => topic.replace(/#/g, '**').replace(/\+/g, '*');

const asyncMethodNames = ['publish', 'subscribe', 'unsubscribe', 'end'];

/**
 * Monkeypatches a `MqttClient` instance.
 * Promisifies `end`, `subscribe`, `publish`, and `unsubscribe`.
 * Adds special behavior around `on`, `once`, `removeListener`, `emit`, etc.
 * @param {MqttClient} client - MqttClient (mutated)
 * @param {Object} [baseOpts] - MqttClient options
 * @param {string|Function} [baseOpts.decoder='text'] - Default decoder to use
 *   on received messages (one of `json`, `text`, or `base64`) or a custom
 *   decoder
 * @returns {MqttClient} Patched client
 */
const toadpatch = (client, baseOpts = {}) => {
  const asyncMethods = asyncMethodNames.reduce(
    (acc, name) => Object.assign(acc, {[name]: promisify(client[name])}),
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
   * @param {string} topic - MQTT topic
   * @param {Function} listener - Listener function; called with  `message` and
   *   raw `packet`
   * @param {Object} [opts] - Any options for MQTT subscription
   * @param {number} [opts.qos=0] - QoS
   * @param {string|Function} [opts.decoder] - Decoder to use; will default to
   *   built-in or custom decoder supplied during `connect()`; if none
   *   supplied, the default is the `text` decoder
   * @returns Promise<{{topic, qos}}> Object w/ topic subscribed to and QoS
   *   granted by broker
   */
  client.subscribe = async function toadSubscribe(topic, listener, opts = {}) {
    if (typeof topic !== 'string' || typeof listener !== 'function') {
      throw new TypeError('Invalid parameters');
    }

    opts = normalizeOptions(opts, baseOpts);
    const {toad} = this;
    const {decoder} = opts;
    const event = eventify(topic);

    toad.on(event, (message, packet) => {
      listener(decoder(message), packet);
    });

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
   * @param {string} topic - MQTT topic
   * @param {Function} [listener] - Listener function to remove; if omitted, *all* listeners are removed, and the topic is unsubscribed.
   * @returns {Promise<boolean>} `true` if unsubscribed, `false` if not
   */
  client.unsubscribe = async function toadUnsubscribe(topic, listener) {
    const {toad} = this;
    const event = eventify(topic);
    if (!listener) {
      toad.removeAllListeners(event);
    } else {
      toad.removeListener(event, listener);
    }
    if (!toad.listenerCount(event)) {
      await asyncMethods.unsubscribe.call(this, topic);
      return true;
    }
    return false;
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
   * @public
   * @param topic
   * @param message
   * @param {Object} [opts] - `MqttClient#publish()` options
   * @param {string|Function} [opts.encoder] - Encoder to use; will default to
   *   built-in or custom decoder supplied during `connect()`; if none
   *   supplied, the default is the `text` encoder
   * @returns {Promise<void>}
   */
  client.publish = async function(topic, message, opts = {}) {
    opts = normalizeOptions(opts, baseOpts);
    const {encoder} = opts;
    return asyncMethods.publish.call(this, topic, encoder(message), opts);
  };

  /**
   * On any received message, delegate to the internal EE2 instance
   * where the real listeners for subscriptions are stored.
   */
  client.on('message', function(topic, message, packet) {
    this.toad.emit(eventify(topic), message, packet);
  });

  return client;
};

const normalizeOptions = (opts = {}, defaults = DEFAULT_OPTS) => {
  [['decoder', decoders], ['encoder', encoders]].forEach(([prop, builtins]) => {
    if (prop in opts) {
      if (typeof opts[prop] === 'string') {
        const value = builtins[opts[prop]];
        if (!value) {
          throw new ReferenceError(`unknown ${prop} "${opts[prop]}"`);
        }
        opts[prop] = value;
      } else if (typeof opts[prop] !== 'function') {
        throw new TypeError(`${prop} must be string or function`);
      }
    }
  });
  return Object.assign(opts, defaults, opts);
};

/**
 * Accepts same parameters as `mqtt.connect`, except returns a `Promise`
 * which is fulfilled when the connection is made.
 * Returns a fancypants patched `MqttClient` instance.
 * @see https://www.npmjs.com/package/mqtt#connect
 * @returns {Promise<MqttClient>} Patched `MqttClient` instance
 */
exports.connect = async (url, opts = {}) => {
  if (typeof url === 'undefined') {
    throw new Error('Invalid arguments');
  }
  let args;
  if (typeof url === 'string') {
    opts = normalizeOptions(opts);
    args = [url, opts];
  } else {
    opts = normalizeOptions(url);
    args = [opts];
  }
  const path = opts.mitm ? 1833 : opts.path;
  return new Promise((resolve, reject) => {
    (path
      ? MQTT.MqttClient(() => net.createConnection(path), {
          resubscribe: false
        })
      : MQTT.connect(...args)
    )
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
        resolve(toadpatch(this, opts));
      });
  });
};

exports.patch = toadpatch;
exports.Store = MQTT.Store;
