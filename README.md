# Serverless IFC


### How to Connect to the AWS Resources Used in the Evaluation:

#### Connect to AWS EC2 machine:

    $ ssh -i "vmware.pem" ubuntu@ec2-54-215-176-231.us-west-1.compute.amazonaws.com

#### Connect to AWS RDS DB:

    $ mysql -u vmwuser -h serverlessproject.c1kfax8igvaq.us-west-1.rds.amazonaws.com -P 3306 -p
    >> [password] serverlessifc


### RDS Configuration
There are certain options that need to be enabled in RDS.

Allow creation of triggers:

    log_bin_trust_function_creators = 1

Logging of all queries (useful for debug):

    general_log = 1

    