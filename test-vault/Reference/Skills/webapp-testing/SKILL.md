---
name: Web App Testing
description: Skill for testing web applications including unit, integration, and E2E tests
license: MIT
---

# Web App Testing Skill

This skill provides guidance for testing web applications comprehensively.

## When to Use

- Setting up a new testing framework
- Writing unit tests for components
- Creating integration tests
- Setting up end-to-end tests
- Improving test coverage

## Testing Layers

### Unit Tests
- Test individual functions and components in isolation
- Mock external dependencies
- Focus on edge cases and error handling
- Aim for fast execution

### Integration Tests
- Test component interactions
- Verify API integrations
- Test database operations
- Check authentication flows

### E2E Tests
- Test complete user workflows
- Verify critical paths (signup, checkout, etc.)
- Test across different browsers
- Include accessibility checks

## Best Practices

1. Follow the testing pyramid (many unit, fewer integration, fewest E2E)
2. Write tests before fixing bugs (TDD for bug fixes)
3. Keep tests independent and idempotent
4. Use meaningful test descriptions
5. Maintain test data separately from test logic
