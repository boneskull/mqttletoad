'use strict';

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

exports.createBroker = () =>
  new Broker(client => {
    client
      .on('connect', () => {
        client.connack({returnCode: 0});
      })
      .on('pingreq', () => {
        client.pingresp();
      })
      .on('subscribe', packet => {
        client.suback({
          messageId: packet.messageId,
          granted: packet.subscriptions.map(e => e.qos)
        });
      })
      .on('unsubscribe', packet => {
        client.unsuback(packet);
      })
      .on('pubrel', packet => {
        client.pubcomp(packet);
      })
      .on('pubrec', packet => {
        client.pubrel(packet);
      })
      .on('publish', packet => {
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
