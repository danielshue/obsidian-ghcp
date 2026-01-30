---
name: GitHub Actions Debugging
description: Skill for debugging and troubleshooting GitHub Actions workflows
license: MIT
---

# GitHub Actions Debugging Skill

This skill helps debug and troubleshoot GitHub Actions workflows.

## When to Use

- Workflow runs fail unexpectedly
- Jobs are timing out
- Artifacts aren't being uploaded correctly
- Matrix builds have issues
- Secrets aren't being passed correctly

## Common Issues

### Job Failures
- Check the specific step that failed
- Review environment variables
- Verify permissions (GITHUB_TOKEN scopes)
- Check for rate limiting issues

### Timeout Issues
- Review job timeout settings
- Check for infinite loops in scripts
- Consider breaking large jobs into smaller ones

### Artifact Problems
- Verify paths are correct
- Check file permissions
- Ensure files exist before upload

## Debugging Tips

1. Enable debug logging with `ACTIONS_STEP_DEBUG`
2. Use `actions/runner-diagnostic-logs`
3. Add diagnostic steps to print environment info
4. Test workflows locally with `act`
