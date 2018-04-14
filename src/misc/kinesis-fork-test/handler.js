'use strict';
const fork = require('fork');
const aws = require('aws-sdk');
aws.config.logger = console;

module.exports.kinesisTest = (event, context, callback) => {
    
    const isChild = fork.fork();
    
    if ((isChild && !process.env.PUT_FROM_PARENT) || 
        (!isChild && process.env.PUT_FROM_PARENT)) {
        console.log(`### Putting as ${isChild? 'Child' : 'Parent' }`);
        
//        const aws = require('aws-sdk');
        const kinesis = new aws.Kinesis()
        const newEvent = {
          Data: '    Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
          PartitionKey: 1, 
          StreamName: process.env.STREAM_NAME,
        }
        kinesis.putRecord(newEvent, (err, data) => {
            if (err) {
                callback(null, {message: 'Encountered error in kinesis', err})
            } else {
                callback(null, {message: 'Successfully ran in kinesis', data})
            }
        })
    // } else () {        
    }

    if (!isChild) {
        fork.wait();
    }


  // const response = {
  //   statusCode: 200,
  //   body: JSON.stringify({
  //     message: 'Go Serverless v1.0! Your function executed successfully!',
  //     input: event,
  //   }),
  // };

  // callback(null, response);

  // Use this code if you don't use the http event with the LAMBDA-PROXY integration
  // callback(null, { message: 'Go Serverless v1.0! Your function executed successfully!', event });
};
