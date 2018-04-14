'use strict';
const aws = require('aws-sdk');
const AJV = require('ajv');
const fs = require('fs');
const Promise = require('bluebird');
const KH = require('kinesis-handler');
const nodemailer = require('nodemailer');
const got = require('got');
const url = require('url');

const productPurchaseSchema = require('./schemas/product-purchase-schema.json');
const productCreateSchema = require('./schemas/product-create-schema.json');
const userLoginSchema = require('./schemas/user-login-schema.json');
const updatePhoneSchema = require('./schemas/user-update-phone-schema.json');
const addRoleSchema = require('./schemas/user-add-role-schema.json');

console.log('### Finished all requires in handler.js');

module.exports.hello = (event, context, callback) => {
    console.log('### Call to hello in handler.js');
    callback(null, { message: 'Success!'});
};
