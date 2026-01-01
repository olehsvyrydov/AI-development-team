Plan: Add Performance Testing Modules to E2E Tester

     Overview

     Enhance /e2e-tester skill with comprehensive performance testing capabilities using internal modules (following Apex's pattern).

     Files to Modify

     | File                                                    | Action                          |
     |---------------------------------------------------------|---------------------------------|
     | ~/.claude/skills/e2e-tester/SKILL.md                    | Add performance testing modules |
     | ~/Documents/my/ai-dev-team/skills/quality/e2e-tester.md | Sync project-level copy         |

     Performance Testing Modules to Add

     Module 1: [Skill: LoadTester] - Load & Stress Testing

     Tools: k6 (Grafana), Artillery

     Capabilities:
     - Load profiles (constant, ramping, spike, soak)
     - Concurrent user simulation
     - Throughput testing
     - Stress testing to find breaking points
     - Distributed load testing
     - Thresholds and SLOs

     Templates:
     - k6 load test script
     - Artillery configuration
     - CI/CD integration (GitHub Actions)

     Module 2: [Skill: WebVitalsAnalyzer] - Core Web Vitals & Frontend Performance

     Tools: Playwright Performance APIs, Lighthouse

     Capabilities:
     - Core Web Vitals (LCP, FID, CLS, INP)
     - Time to Interactive (TTI)
     - First Contentful Paint (FCP)
     - Bundle size analysis
     - Network waterfall analysis
     - Performance budgets

Templates:
     - Playwright performance test
     - Lighthouse CI configuration
     - Performance budget assertions

     Module 3: [Skill: APIPerformanceTester] - API Performance Testing

     Tools: k6, Artillery, Playwright API testing

     Capabilities:
     - Response time percentiles (p50, p95, p99)
     - Throughput (requests/second)
     - Error rate monitoring
     - API latency under load
     - Database query performance
     - Connection pool testing

     Templates:
     - API load test script
     - Performance assertions
     - Benchmark comparison

     Module 4: [Skill: PerformanceReporter] - Metrics & Reporting

     Capabilities:
     - Performance metrics collection
     - Trend analysis
     - Regression detection
     - CI/CD integration
     - Dashboard visualization (Grafana)
     - Alerting thresholds

     Templates:
     - Performance report format
     - Grafana dashboard config
     - GitHub Actions workflow


Implementation Structure

     ## Skill Modules (Auto-Activated) - Performance Testing

     ### [Skill: LoadTester] - Load & Stress Testing
     **Trigger:** "load test", "stress test", "concurrent users", "throughput", "k6", "artillery"
     **Action:** Create load test scripts, define thresholds, run distributed tests

     ### [Skill: WebVitalsAnalyzer] - Core Web Vitals
     **Trigger:** "web vitals", "LCP", "CLS", "lighthouse", "performance budget"
     **Action:** Measure Core Web Vitals, create performance budgets, run Lighthouse CI

     ### [Skill: APIPerformanceTester] - API Performance
     **Trigger:** "API performance", "response time", "latency", "p95", "throughput"
     **Action:** Create API benchmarks, measure percentiles, test under load

     ### [Skill: PerformanceReporter] - Metrics & Reporting
     **Trigger:** "performance report", "metrics", "regression", "dashboard"
     **Action:** Generate reports, detect regressions, configure dashboards

     Standards to Include

     Performance Benchmarks (SaaS Industry)

     | Metric           | Good    | Excellent |
     |------------------|---------|-----------|
     | API p95 Response | <500ms  | <200ms    |
     | API p99 Response | <1000ms | <500ms    |
     | LCP              | <2.5s   | <1.5s     |
     | FID/INP          | <100ms  | <50ms     |
     | CLS              | <0.1    | <0.05     |
     | Error Rate       | <1%     | <0.1%     |

     Load Test Patterns

     1. Smoke Test: 1-5 users, verify system works
     2. Load Test: Expected concurrent users
     3. Stress Test: Beyond expected capacity
     4. Spike Test: Sudden traffic surge
     5. Soak Test: Extended duration (hours)


Code Templates to Include

     1. k6 Load Test Script - Complete example with thresholds
     2. Artillery Config - YAML configuration with scenarios
     3. Playwright Web Vitals - Core Web Vitals measurement
     4. Lighthouse CI Config - Performance budget assertions
     5. GitHub Actions Workflow - CI/CD performance testing
     6. Performance Report Template - Markdown report format

     Checklist for Implementation

     - Add Skill Modules section after existing content
     - Include all 4 performance modules
     - Add k6 templates with thresholds
     - Add Artillery configuration templates
     - Add Playwright performance APIs
     - Add Core Web Vitals measurement
     - Add API performance testing
     - Add industry benchmarks
     - Add CI/CD integration examples
     - Add performance report template
     - Sync to project-level skill file
     - Update README version history
