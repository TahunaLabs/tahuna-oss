in cli-ux.md
- run list :GPU#  VOL should be even in non verbose mode. (now they are there, but have no column header)
- on CLI the user laptop: "CONVEX_SITE_URL" should not be called like so as it reveals the name of our backend provider. Same thing for "NEXT_PUBLIC_CONVEX_SITE_URL".
- similarly to dashboard.md, already existing data, owned by user could be chosen and binded instead of selecting or creating a data dir
- user should be able to list available gpus (shows existing gpus and their max gpu count)
- user should be able to list existing data
- of course all this should be standardized and consistant in the way with which it's coded and documented
- run create should be able to take a name, if not given a name, it should be gived a "word-based random ID". it can also be renamed !


in dashboard.md
- As the api key setting is now implicit through CLI. The "| API key page | `/api-key` — legacy key management (view/revoke only) |" should also change to manage "machines" or "sessions" or something, you phrase is.
- the "API key page" should match the dashboard theme and drop the old legacy one
- the "Login page" should match the dashboard theme and drop the old legacy one
- missing feature from dashboard: the environment's configuration file (binded (selected or created) during tahuna init .) should be turned into a rendered UI theme configuration section, that can be tweeked before creating a run

environments.md
- "Framework is detected from requirements.txt and determines pod image selection." -> Framework and Pytohn version should be detected from "uv" files !!!!!!


- new items landing in a selected/ created output directory should also land in the Storage section of the dashboard.
- multiple data items can be binded to environment (e.g. user wants to load an already pretrained model for finetuning and the finetuning data)

init.md
- '- If not found: "No entrypoint found. ' no it should be consistant with the rest ! same for any scaffold messaging, adhere to similar convention of: '- If not found: "Creating data/ directory."'
- '- Parse requirements.txt for "torch"/"pytorch" -> PyTorch' no! use UV. 

pod-bootstrap.md
-"b. Default: `python3 -u {entrypoint}`-" Should use UV ! And GPU libraries should be adapted to gpu
- "Pod is fully ephemeral. After termination, all local state is lost." except selected outputs/ dir which is backed

run-lifecycle.md
- run create should be able to take a name, if not given a name, it should be gived a "word-based random ID". it can also be renamed !
- "Grace period: 30 seconds for checkpoint save", what if it takes more than 30S which is the case for large models ? just queue save + terminate

sync.md
- syncing back selected outputs/ dir, isn't versioned, only last version is preserved

accross all markdowns:
- error state don't look consistant !
- "Retry 3 times", "grace timer" and all other constants/ default values should should append go to web/ level config.ts
- selected outputs/ should also be excluded from sync in case its in the user local env, it should only be synced from pod
- create run -n/ --name to name run
- create run --rename <id or name> to rename run
