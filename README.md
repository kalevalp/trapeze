# Serverless IFC


### How to Connect to the AWS Resources Used in the Evaluation:

#### Connect to AWS EC2 machine:

    $ ssh -i "vmware.pem" ubuntu@ec2-54-215-176-231.us-west-1.compute.amazonaws.com

#### Connect to AWS RDS DB:

    $ mysql -u vmwuser -h serverlessproject.c1kfax8igvaq.us-west-1.rds.amazonaws.com -P 3306 -p
    >> [password] serverlessifc


### RDS Configuration
Need to make sure that the RDS mysql server is running with the option log_bin_trust_function_creators = 1.
Otherwise, creating tables with update triggers will fail.