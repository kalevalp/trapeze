#### Note on AWS Lambda Optimizations

The decision to use a sandbox to execute arbitrary javascript code clashes
with potential AWS Lambda optimizations.
Consider for example the naive optimization that imports the handler on the
first invocation of the lambda, and on subsequent invocations merely calls
the handler. Our decision to wrap the arbitrary lambda code in a sandbox
means that we wrap the *import* part of the original lambda, in essence
ensuring that each invocation has to run the import.

This is not necessarily a bad thing, as an imported function can manage
local state through closures (for classes it is even simpler) thus
violating one of our main assumptions.
Still, this is an important thing to take into account. 
