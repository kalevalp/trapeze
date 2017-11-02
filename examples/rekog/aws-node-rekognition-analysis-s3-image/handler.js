'use strict';

const ImageAnalyser = require('./lib/imageAnalyser');

/**
  Analyse an image in the k-v store using table name and image key
 */
module.exports.imageAnalysis = (event, context, callback) => {
  const data = JSON.parse(event.body);

  const imageConfig = {
    tableName: data.tableName,
    imageKeyName: data.imageKeyName,
  };

  return ImageAnalyser
    .getImageLabels(imageConfig)
    .then((labels) => {
      const response = {
        statusCode: 200,
        body: JSON.stringify({ Labels: labels }),
      };
      callback(null, response);
    })
    .catch((error) => {
      callback(null, {
        statusCode: error.statusCode || 501,
        headers: { 'Content-Type': 'text/plain' },
        body: error.message || 'Internal server error',
      });
    });
};
