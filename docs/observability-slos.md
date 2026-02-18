# Observability SLO/SLI and Alarm Guide

## Key SLIs

1. API Availability
- Metric source: `/api/health` and HTTP 5xx ratio
- Primary metrics:
  - `adaptive_http_requests_total`
  - `adaptive_http_request_duration_ms`

2. API Error Rate
- Definition: 5xx responses / total responses over 5 minutes
- Alert threshold:
  - Warning: > 1%
  - Critical: > 3%

3. API Latency (p95)
- Metric: `adaptive_http_request_duration_ms`
- Alert threshold:
  - Warning: p95 > 800ms (5m)
  - Critical: p95 > 1500ms (5m)

4. AI Queue Health
- Metrics:
  - `adaptive_ai_jobs_total{status="failed"}`
  - queue metrics endpoint `/api/ai/queue-metrics`
- Alert threshold:
  - Warning: failed jobs > 10 in 10m
  - Critical: DLQ non-empty for > 10m

5. AI Quota Pressure
- Metrics:
  - `adaptive_ai_quota_used`
  - `adaptive_ai_quota_limit`
- Alert threshold:
  - Warning: used/limit > 0.8
  - Critical: used/limit >= 1.0

6. Auth Stability
- Metrics:
  - `adaptive_auth_login_total{result="failure"}`
  - `adaptive_auth_refresh_total{result="failure"}`
- Alert threshold:
  - Warning: login failure ratio > 20% (possible abuse)
  - Critical: refresh failure ratio > 20% (token/session incident)

## Suggested Prometheus Alert Rules

```yaml
groups:
  - name: adaptive-api
    rules:
      - alert: AdaptiveApiHigh5xx
        expr: |
          (
            sum(rate(adaptive_http_requests_total{status=~"5.."}[5m]))
            /
            sum(rate(adaptive_http_requests_total[5m]))
          ) > 0.03
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Adaptive Tutor API high 5xx ratio"

      - alert: AdaptiveApiLatencyP95High
        expr: |
          histogram_quantile(0.95,
            sum(rate(adaptive_http_request_duration_ms_bucket[5m])) by (le)
          ) > 1500
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Adaptive Tutor API p95 latency high"

      - alert: AdaptiveAiQuotaExhausted
        expr: |
          (adaptive_ai_quota_used / adaptive_ai_quota_limit) >= 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Tenant AI quota exhausted"
```

## Runbook Pointers

- High 5xx: inspect recent deploy, app logs by correlation ID, DB/Redis health.
- High latency: inspect hot endpoints, DB slow queries, cache hit ratios.
- AI failures: inspect DLQ entries from `/api/ai/queue-metrics`, check provider health and schema validation.
- Auth failure spikes: verify rate-limit behavior, suspicious IPs, token signing secret mismatch.
