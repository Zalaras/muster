Taking long time to launch a new session

A newly launched session took a long time to come up with six live sessions open.

musterd logged:

```
model-catalog check failed; unchecked error="context deadline exceeded"
```

To reproduce, run `make dev`, open six sessions, then launch a seventh.
