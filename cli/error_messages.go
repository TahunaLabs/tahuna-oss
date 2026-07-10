package main

// Error copy shown to CLI users. Kept in one place so wording stays
// consistent, and so backend error text is never shown to users raw.
// Mirrors web/lib/error-messages.ts wording where the same underlying
// action fails in both interfaces.
const (
	errMsgGeneric = "Something went wrong. Please try again."

	errMsgSessionExpired      = "Session expired. Run `tahuna login` to re-authenticate."
	errMsgNotAuthenticated    = "Not authenticated. Run `tahuna login` first."
	errMsgAccessDenied        = "Access denied."
	errMsgEnvironmentNotFound = "Environment not found."
	errMsgEnvVarNotFound      = "Env var not found."
	errMsgRunNotFound         = "Run not found."
	errMsgResourceNotFound    = "Resource not found."
	errMsgCannotReachBackend  = "Cannot reach Tahuna backend. Check your connection."

	errMsgEnvironmentMissingCommand      = "This environment has no command configured. Run `tahuna sync` before launching a run."
	errMsgEnvironmentMissingDependencies = "This environment has no training dependencies configured. Run `tahuna sync` before launching a run."
	errMsgEnvironmentCodeNotSynced       = "This environment's code is not synced. Run `tahuna sync` before launching a run."
	errMsgRunNameAlreadyUsed             = "That run name is already in use. Choose a different name."
	errMsgRuntimeLaunchBlocked           = "This GPU/image combination is temporarily unavailable. Try a different GPU or image."
	errMsgInvalidEnvironmentConfigPrefix = "Your environment config is invalid:"
)
