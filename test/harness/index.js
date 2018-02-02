'use strict';

const _ = require('lodash');
const {Server} = require('net');
const MqttConnection = require('mqtt-connection');

class Broker extends Server {
  constructor(listener) {
    super();
    this.on('connection', stream => {
      this.emit('client', new MqttConnection(stream));
    });
    if (listener) {
      this.on('client', listener);
    }
  }
}

exports.Broker = Broker;

exports.createBroker = async (port, transformers = {}) => {
  transformers = _.defaults(transformers, {
    connack(...args) {
      return {returnCode: 0};
    },
    subscribe(packet) {
      return {
        messageId: packet.messageId,
        granted: packet.subscriptions.map(e => e.qos)
      };
    },
    pingreq: _.noop,
    unsubscribe: _.identity,
    pubrel: _.identity,
    pubrec: _.identity,
    publish: _.identity
  });
  const broker = new Broker(client => {
    client
      .on('connect', (...args) => {
        client.connack(transformers.connack(...args));
      })
      .on('pingreq', (...args) => {
        client.pingresp(transformers.pingreq(...args));
      })
      .on('subscribe', (...args) => {
        client.suback(transformers.subscribe(...args));
      })
      .on('unsubscribe', (...args) => {
        client.unsuback(transformers.unsubscribe(...args));
      })
      .on('pubrel', (...args) => {
        client.pubcomp(transformers.pubrel(...args));
      })
      .on('pubrec', (...args) => {
        client.pubrel(transformers.pubrec(...args));
      })
      .on('publish', packet => {
        packet = transformers.publish(packet);
        process.nextTick(() => {
          client.publish(packet);
          switch (packet.qos) {
            case 0:
              break;
            case 1:
              client.puback(packet);
              break;
            case 2:
              client.pubrec(packet);
              break;
          }
        });
      })
      .on('close', () => {
        client.destroy();
      })
      .on('error', () => {
        client.destroy();
      })
      .on('timeout', () => {
        client.destroy();
      })
      .on('disconnect', () => {
        client.destroy();
      });
  });
  broker.transformers = transformers;
  broker.port = port;
  return new Promise((resolve, reject) => {
    broker.listen(port, err => {
      if (err) {
        return reject(err);
      }
      resolve(broker);
    });
  });
};
