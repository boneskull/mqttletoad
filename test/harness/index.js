'use strict';

const _ = require('lodash');
const {Server} = require('net');
const MqttConnection = require('mqtt-connection');
const MITM = require('mitm');
const promisify = require('promwrap');
const stoppable = require('stoppable');

class BaseServer extends Server {
  constructor(listener) {
    super();

    if (listener) {
      this.on('client', listener);
    }
  }
}

class Broker extends BaseServer {
  constructor(listener) {
    super(listener);

    this.on('connection', sock => {
      this.emit('client', new MqttConnection(sock));
    });
  }
}

class MITMBroker extends BaseServer {
  listen(ignored, done) {
    this.mitm = MITM();
    this.mitm.on('connection', sock => {
      this.emit('client', new MqttConnection(sock));
    });
    process.nextTick(done);
  }

  close(done) {
    this.mitm.disable();
    process.nextTick(done);
  }
}

exports.Broker = BaseServer;

exports.createBroker = async ({port, path, mitm, transformers = {}} = {}) => {
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

  const listener = client => {
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
      });
  };

  const broker = stoppable(new (mitm ? MITMBroker : Broker)(listener), 0);
  broker.transformers = transformers;
  broker.port = port;
  broker.path = path;
  const promisifiedBroker = promisify(broker, {
    exclude: ['unref', 'address', 'ref']
  });

  await promisifiedBroker.listen(port || path);
  return promisifiedBroker;
};
