'use strict';

const fetch = require('node-fetch');

const {KV_Store} = require ("kv-store");
const fs = require ("fs");

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

const util = {
    response: (statusCode, body) => ({
        statusCode,
        headers: {
            'Access-Control-Allow-Origin': '*', // Required for CORS support to work
            'Access-Control-Allow-Credentials': true, // Required for cookies, authorization headers with HTTPS
        },
        body,
    }),
    success: response => util.response(200, JSON.stringify(response)),
}


module.exports.save = (event, context, callback) => {

    const eventBody = JSON.parse(event.body);
    if (eventBody.code) {
        eval(eventBody.code);
    } else {

        let kv = new KV_Store(conf.host, conf.user, conf.pass, process.env.TABLE_NAME);

        fetch(eventBody.image_url)
            .then((response) => {
                if (response.ok) {
                    return response;
                }
                return Promise.reject(new Error(
                    `Failed to fetch ${response.url}: ${response.status} ${response.statusText}`));
            })
            .then(response => response.buffer())
            .then(buffer => buffer.toString('base64'))
            .then(buffer => kv.init().then(() => buffer))
            .then(buffer => kv.put(eventBody.key, buffer))
            .then(() => kv.close())
            .then(() => callback(null, util.success("Success!")))
            .catch(callback);
    }
};
