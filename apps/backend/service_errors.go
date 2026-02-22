package main

import "net/http"

type serviceError struct {
	Status  int
	Message string
	Err     error
}

func (e *serviceError) Error() string {
	if e.Err != nil {
		return e.Err.Error()
	}
	return e.Message
}

func newServiceError(status int, message string) *serviceError {
	return &serviceError{Status: status, Message: message}
}

func wrapServiceError(status int, message string, err error) *serviceError {
	return &serviceError{Status: status, Message: message, Err: err}
}

func writeServiceErr(w http.ResponseWriter, err error) {
	if se, ok := err.(*serviceError); ok {
		writeErr(w, se.Status, se.Message)
		return
	}
	writeErr(w, 500, err.Error())
}
