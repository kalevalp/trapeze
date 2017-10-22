
# Hello (Secure) Retail

The cloned github repository holding the minimized project can be found [here](https://github.com/kalevalp/hello-retail-baseline).



## Uses of the AWS SDK in Hello Retail

### General AWS
    aws.config.setPromisesDependency(BbPromise)
- message.js
- unmessage.js
- receive.js

### KMS
    const kms = new aws.KMS()

    kms.decrypt

#### Files:
- message.js
- receive.js
- unmessage.js

### Dynamo DB
    const dynamo = new aws.DynamoDB.DocumentClient()

    dynamo.scan
    dynamo.query
    dynamo.update
    dynamo.put
    dynamo.delete

    const data = yield dynamo.query(queryParams).promise()
    const updateData = yield dynamo.update(update
    dynamo.get(params).promise().then(...)
    return dynamo.update(params).promise().then(...)

#### Files:
- catalogApi.js
- catalog.js
- processor.js
- assign.js
- record.js
- receive.js
- fail.js
- unmessage.js
- report.js


### Step Functions

    const stepfunctions = new aws.StepFunctions()

    stepfunctions.startExecution
    stepfunctions.getActivityTask
    stepfunctions.sendTaskFailure
    return stepfunctions.sendTaskSuccess(params).promise().then(...)

#### Files: 
- processor.js
- receive.js
- record.js


### Kinesis
    const kinesis = new aws.Kinesis()

    kinesis.putRecord

#### Files:
- report.js
- eventWriterApi.js

### S3
     const s3 = new aws.S3()

     return s3.putObject(params).promise().then(...)

#### Files:
- receive.js
