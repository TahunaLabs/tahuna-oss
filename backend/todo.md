1. make endpoints
2. sdk that call endpoints and uploads to their generate r2s
3. amalgamation of the 3 steps in one command
4. interactive cli
5. if config.yaml in artefact, show it in UI + possible to override with run cmd/sdk ?
6. first occurence of train.py with train function, is entrypoint unless another entrypoint path is specified. 
7. same for entry point function name. let's make it train_fn by default like sagemaker ? Now it's just runing the script without function
8. time out before deleting pod ?
9. when docker sets a bad cuda version, the pod keeps running !! that shouldn't be the case !!!
