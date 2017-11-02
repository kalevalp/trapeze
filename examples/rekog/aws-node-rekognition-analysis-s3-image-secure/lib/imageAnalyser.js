'use strict';

const AWS = require('aws-sdk');

const rek = new AWS.Rekognition();

const {KV_Store} = require ("kv-store");
const fs = require ("fs");

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));



class ImageAnalyser {

    static getImageLabels(imageConfig) {
        console.log(`Analyzing image in table: ${imageConfig.tableName}, with key: ${imageConfig.imageKeyName}`);

        let kv = new KV_Store(conf.host, conf.user, conf.pass, imageConfig.tableName);

        return kv.init()
            .then(() => kv.get(imageConfig.imageKeyName))
            .then(image => kv.close().then(() => image))
            .then(image => new Promise(
                (resolve, reject) => {
                    rek.detectLabels(
                        {
                            Image: {
                                Bytes: Buffer.from(image, 'base64'),
                            },
                            MaxLabels: 10,
                            MinConfidence: 50,
                        },
                        (err, data) => {
                            if (err) {
                                console.log(err);
                                return reject(new Error(err));
                            }
                            console.log('Analysis labels:', data.Labels);
                            return resolve(data.Labels);
                        });
                }));
    }
}

module.exports = ImageAnalyser;
