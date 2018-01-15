'use strict';

const atob = str => Buffer.from(str, 'base64').toString('binary');

/**
 * JSON decoder
 * @param {Buffer} value - Value to decode
 * @returns {*} JSON representation of value
 */
const json = value => JSON.parse(value.toString('utf-8'));

/**
 * Base64 decoder
 * @param {Buffer} value - Value to decode
 * @returns {string} base64-encoded string
 */
const base64 = value => atob(value.toString('utf-8'));

/**
 * Text decoder
 * @param {Buffer} value - Value to decode
 * @returns {string} utf-8 encoded string
 */
const text = value => value.toString('utf-8');

/**
 * Binary decoder (does nothing)
 * @param {Buffer} value - Value to decode
 * @returns {Buffer} Unmolested `value`
 */
const binary = value => value;

exports.json = json;
exports.base64 = base64;
exports.text = text;
exports.binary = binary;
