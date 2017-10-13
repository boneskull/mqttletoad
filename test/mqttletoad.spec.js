/* eslint-env mocha */
'use strict';

const expect = require('unexpected');
const {MqttClient} = require('mqtt');
const {connect} = require('..');
const {createBroker} = require('./harness');
const getPort = require('get-port');

describe('mqttletoad', function() {
  let broker;
  let port;

  before(async function() {
    port = await getPort();
  });

  beforeEach(async function() {
    broker = createBroker();
    return new Promise((resolve, reject) => {
      broker.listen(port, err => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });

  afterEach(function(done) {
    broker.close(done);
  });

  describe('connect()', function() {
    let promise;

    beforeEach(function() {
      promise = connect(`mqtt://localhost:${port}`);
    });

    afterEach(async function() {
      const client = await promise;
      await client.end();
    });

    it('should resolve with the wrapped MqttClient once connected', async function() {
      return expect(
        promise,
        'when fulfilled',
        expect.it('to be a', MqttClient)
      );
    });

    it('should not allow an invalid message to be published', async function() {
      const client = await promise;
      return expect(client.publish('foo/bar', new Date()), 'to be rejected');
    });
  });

  describe('mqttletoad client', function() {
    let client;

    beforeEach(async function() {
      client = await connect(`mqtt://localhost:${port}`);
    });

    afterEach(async function() {
      return client.end();
    });

    describe('publish()', function() {
      it('should reject if non-string or non-Buffer value', async function() {
        return expect(client.publish('foo', new Date()), 'to be rejected');
      });

      describe('default QoS (0)', function() {
        it('should publish with the (string) message and fulfill', async function() {
          return expect(
            client.publish('foo', 'bar'),
            'to be fulfilled with',
            void 0
          );
        });

        it('should publish with the (Buffer) message and fulfill', async function() {
          return expect(
            client.publish('foo', Buffer.from([0x00, 0x01, 0x02])),
            'to be fulfilled with',
            void 0
          );
        });
      });

      describe('QoS 1', function() {
        it('should publish with the (string) message and fulfill', async function() {
          return expect(
            client.publish('foo', 'bar'),
            'to be fulfilled with',
            void 0
          );
        });

        it('should publish with the (Buffer) message and fulfill', async function() {
          return expect(
            client.publish('foo', Buffer.from([0x00, 0x01, 0x02])),
            'to be fulfilled with',
            void 0
          );
        });
      });
    });

    describe('subscribe()', function() {
      describe('invalid parameters', function() {
        describe('no parameters', function() {
          it('should reject', async function() {
            return expect(() => client.subscribe(), 'to be rejected');
          });
        });

        describe('undefined listener', function() {
          it('should reject', async function() {
            return expect(() => client.subscribe('foo/bar'), 'to be rejected');
          });
        });

        describe('non-function listener', function() {
          it('should reject', async function() {
            return expect(
              () => client.subscribe('foo/bar', {}),
              'to be rejected'
            );
          });
        });
      });

      it('should subscribe to a topic w/ QoS 0', async function() {
        return expect(
          client.subscribe('foo/bar', () => {}),
          'to be fulfilled with',
          {
            topic: 'foo/bar',
            qos: 0
          }
        );
      });

      it('should subscribe to a topic w/ QoS 1', async function() {
        return expect(
          client.subscribe('foo/bar', () => {}, {qos: 1}),
          'to be fulfilled with',
          {
            topic: 'foo/bar',
            qos: 1
          }
        );
      });

      it('should subscribe to a topic w/ QoS 2', async function() {
        return expect(
          client.subscribe('foo/bar', () => {}, {qos: 2}),
          'to be fulfilled with',
          {
            topic: 'foo/bar',
            qos: 2
          }
        );
      });

      it('should execute the listener when exact matching topic received', async function() {
        return new Promise((resolve, reject) => {
          client.subscribe('foo/bar', message => {
            expect(String(message), 'to equal', 'baz');
            resolve();
          });
          client.publish('foo/bar', 'baz');
        });
      });

      it('should execute the listener when wildcard (#) topic received', async function() {
        return new Promise((resolve, reject) => {
          client.subscribe('foo/#', message => {
            expect(String(message), 'to equal', 'quux');
            resolve();
          });
          client.publish('foo/bar', 'quux');
        });
      });

      it('should execute the listener when wildcard (+) topic received', async function() {
        return new Promise((resolve, reject) => {
          client.subscribe('foo/+/baz', message => {
            expect(String(message), 'to equal', 'quux');
            resolve();
          });
          client.publish('foo/bar/baz', 'quux');
        });
      });

      it('should always call the listener with a Buffer', async function() {
        return new Promise((resolve, reject) => {
          client.subscribe('foo/bar', message => {
            expect(Buffer.isBuffer(message), 'to be', true);
            resolve();
          });
          client.publish('foo/bar', 'baz');
        });
      });

      it('should always call the listener with a raw packet', function() {
        return new Promise((resolve, reject) => {
          client.subscribe('foo/+', (message, packet) => {
            expect(packet, 'to satisfy', {
              cmd: 'publish',
              retain: false,
              qos: 0,
              dup: false,
              length: 12,
              topic: 'foo/bar',
              payload: expect.it('when decoded as', 'utf-8', 'to equal', 'baz')
            });
            resolve();
          });
          client.publish('foo/bar', 'baz');
        });
      });

      it('should execute all matching handlers (in order of specificity)', async function() {
        const received = [];
        await Promise.all([
          client.subscribe('foo/+/bar', _ => {
            received.push('foo/+/bar');
          }),
          client.subscribe('foo/#', _ => {
            received.push('foo/#');
          }),
          client.subscribe('foo/quux/bar', _ => {
            received.push('foo/quux/bar');
          })
        ]);

        // QoS 1 means we get the puback, so we can be sure the handlers were
        // called.
        await client.publish('foo/quux/bar', 'baz', {qos: 1});
        expect(received, 'to equal', ['foo/quux/bar', 'foo/+/bar', 'foo/#']);
      });

      it('should subscribe to the same topic twice', async function() {
        const received = [];
        await client.subscribe('foo/bar', msg => {
          received.push('one');
        });
        await client.subscribe('foo/bar', msg => {
          received.push('two');
        });
        await client.publish('foo/bar', 'baz', {qos: 1});
        expect(received, 'to equal', ['one', 'two']);
      });
    });

    describe('end()', function() {
      describe('when connected', function() {
        it('should disconnect', async function() {
          await expect(client.end(), 'to be fulfilled');
          expect(client.connected, 'to be', false);
        });
      });

      describe('when disconnected', function() {
        it('should stay disconnected', async function() {
          await client.end();
          expect(client.reconnecting, 'to be', false);
        });
      });
    });
  });
});
