#!/usr/bin/env bash

curl -X POST --data '{"imageKeyName": "cat1", "tableName" : "StoredFilesTable", "user" : "catowner", "pass" : "catownerpassword"}' $1