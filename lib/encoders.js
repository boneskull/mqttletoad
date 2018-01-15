'use strict';

const btoa = buf => Buffer.from(buf).toString('base64');

/**
 * JSON encoder
 * @param {*} value - Value to encode
 * @returns {string} JSON representation of value
 */
const json = JSON.stringify;

/**
 * Base64 encoder
 * @param {*} value - Value to encode
 * @returns {string} base64-encoded string
 */
const base64 = btoa;

/**
 * Text encoder
 * @param {*} value - Value to encode
 * @returns {string} text representation of string
 */
const text = String;

/**
 * Binary encoder
 * @param {*} value - Value to encode
 * @returns {Buffer} A Buffer representing the value
 */
const binary = value => Buffer.from(value);

exports.json = json;
exports.base64 = base64;
exports.text = text;
exports.binary = binary;
