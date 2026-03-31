package serve

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"
	"time"
)

type processSupervisor struct {
	cmd *exec.Cmd

	lines      chan string
	exited     chan struct{}
	outputDone chan struct{}

	mu         sync.Mutex
	waitErr    error
	outputErr  error
	stopAfter  time.Time
	stopIssued bool
}

func startProcessSupervisor(cmd *exec.Cmd) (*processSupervisor, error) {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdout pipe: %w", err)
	}
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	supervisor := &processSupervisor{
		cmd:        cmd,
		lines:      make(chan string, 128),
		exited:     make(chan struct{}),
		outputDone: make(chan struct{}),
	}
	go supervisor.captureOutput(stdout)
	go supervisor.wait()
	return supervisor, nil
}

func (s *processSupervisor) Lines() <-chan string {
	if s == nil {
		return nil
	}
	return s.lines
}

func (s *processSupervisor) Exited() <-chan struct{} {
	if s == nil {
		return nil
	}
	return s.exited
}

func (s *processSupervisor) WaitErr() error {
	if s == nil {
		return nil
	}
	<-s.exited
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.waitErr
}

func (s *processSupervisor) DrainOutput(emit func(string)) error {
	if s == nil {
		return nil
	}
	for line := range s.lines {
		if emit != nil {
			emit(line)
		}
	}
	<-s.outputDone
	s.mu.Lock()
	defer s.mu.Unlock()
	if isBenignStreamReadError(s.outputErr) {
		return nil
	}
	return s.outputErr
}

func (s *processSupervisor) RequestStop(grace time.Duration) error {
	if s == nil {
		return nil
	}
	if grace <= 0 {
		grace = 30 * time.Second
	}

	s.mu.Lock()
	if s.stopIssued {
		s.mu.Unlock()
		return nil
	}
	s.stopIssued = true
	s.stopAfter = time.Now().Add(grace)
	s.mu.Unlock()

	return s.signal(syscall.SIGTERM)
}

func (s *processSupervisor) ForceStopIfExpired(now time.Time) (bool, error) {
	if s == nil {
		return false, nil
	}

	s.mu.Lock()
	if !s.stopIssued || s.stopAfter.IsZero() || now.Before(s.stopAfter) {
		s.mu.Unlock()
		return false, nil
	}
	s.stopAfter = time.Time{}
	s.mu.Unlock()

	if err := s.kill(); err != nil {
		return false, err
	}
	return true, nil
}

func (s *processSupervisor) StopAndWait(grace time.Duration) error {
	if s == nil {
		return nil
	}
	if grace <= 0 {
		grace = 30 * time.Second
	}
	if err := s.RequestStop(grace); err != nil {
		return err
	}

	timer := time.NewTimer(grace)
	defer timer.Stop()

	select {
	case <-s.exited:
		return nil
	case <-timer.C:
	}

	if _, err := s.ForceStopIfExpired(time.Now()); err != nil {
		return err
	}
	<-s.exited
	return nil
}

func (s *processSupervisor) captureOutput(stdout io.ReadCloser) {
	defer close(s.outputDone)
	defer close(s.lines)

	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 4*1024*1024)
	for scanner.Scan() {
		s.lines <- scanner.Text()
	}

	s.mu.Lock()
	s.outputErr = scanner.Err()
	s.mu.Unlock()
}

func (s *processSupervisor) wait() {
	err := s.cmd.Wait()
	s.mu.Lock()
	s.waitErr = err
	s.mu.Unlock()
	close(s.exited)
}

func (s *processSupervisor) signal(sig syscall.Signal) error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	if err := s.cmd.Process.Signal(sig); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return nil
}

func (s *processSupervisor) kill() error {
	if s == nil || s.cmd == nil || s.cmd.Process == nil {
		return nil
	}
	if err := s.cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
		return err
	}
	return nil
}

func isBenignStreamReadError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrClosed) || errors.Is(err, io.ErrClosedPipe) {
		return true
	}
	normalized := strings.ToLower(err.Error())
	return strings.Contains(normalized, "file already closed")
}
