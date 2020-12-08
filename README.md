# Telemetry

**Modular metrics for Node.js.** Collect, process and publish metrics, picking only the metrics that you need.

[![npm status](http://img.shields.io/npm/v/telemetry-js/telemetry.svg)](https://www.npmjs.org/package/@telemetry-js/telemetry)
[![node](https://img.shields.io/node/v/@telemetry-js/telemetry.svg)](https://www.npmjs.org/package/@telemetry-js/telemetry)
[![Test](https://github.com/telemetry-js/telemetry/workflows/Test/badge.svg?branch=main)](https://github.com/telemetry-js/telemetry/actions)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Table of Contents

<details><summary>Click to expand</summary>

- [Highlights :sparkles:](#highlights-sparkles)
- [Usage](#usage)
- [Examples](#examples)
  - [Basic](#basic)
  - [Aggregation](#aggregation)
  - [But I Just Want To Publish A One-Time Metric](#but-i-just-want-to-publish-a-one-time-metric)
- [Available Plugins](#available-plugins)
  - [Collectors](#collectors)
  - [Schedules](#schedules)
  - [Processors](#processors)
  - [Publishers](#publishers)
- [Naming Guide](#naming-guide)
  - [Metric Names](#metric-names)
  - [Metric Tags](#metric-tags)
  - [Plugin Package Names](#plugin-package-names)
- [API](#api)
- [Install](#install)
- [Acknowledgements](#acknowledgements)
- [License](#license)

</details>

## Highlights :sparkles:

- Plugin-based and evented
- A plugin serves one of 4 roles:
  1. **Collector**: emits metrics (when "pinged")
  2. **Processor**: decorates or combines metrics
  3. **Schedule**: pings other plugins on an interval
  4. **Publisher**: publishes metrics
- Add custom metrics sourced from a function, counter or your own plugin
- Add tags (a.k.a. dimensions) to metrics
- Includes plugins for automatic tags like `instanceid` on EC2
- Locally aggregate before publishing metrics, to save bandwidth
- Publish to CloudWatch, AppOptics, Logz.io Metrics, stdio or your own publisher.

## Usage

To get started you'll need 3 things.

**1. The `telemetry` module (this)**

This module controls what and when to collect and publish metrics. It groups plugins into "tasks". One task might publish a memory metric with a `name` tag to CloudWatch every 5 minutes, while another task publishes the same metric with a `name`, `instanceid` and `region` tag to AppOptics every minute. If the desired tags and interval are the same for both publishers, you can use a single task.

Tasks are also useful to manage the lifetime of metrics. Say we have an application with long-running background jobs that we want metrics on. Each job can have its own telemetry task and add for example a `job_id` tag to its metrics.

**2. At least one collector and publisher**

Without a collector, there are no metrics. Without a publisher, the metrics don't go anywhere.

**3. A schedule like `@telemetry-js/schedule-simple`.**

Most collectors follow a pull-based model: they must be "pinged" before they emit metrics. A schedule does just that, typically pinging your plugins on a fixed interval.

## Examples

### Basic

This example collects Node.js memory metrics every 30 seconds and sends them to CloudWatch with a `name` tag.

```js
const telemetry = require('@telemetry-js/telemetry')()
const mem = require('@telemetry-js/collector-nodejs-memory')
const simple = require('@telemetry-js/schedule-simple')
const tag = require('@telemetry-js/processor-tag')
const cloudwatch = require('@telemetry-js/publisher-cloudwatch')

telemetry.task()
  .collect(mem)
  .schedule(simple, { interval: '30s' })
  .process(tag, { name: 'my-app' })
  .publish(cloudwatch)

// Start tasks
await telemetry.start()
```

### Aggregation

This example collects metrics every 30 seconds, locally aggregates them, and sends summary metrics to CloudWatch and AppOptics every 5 minutes. Those summary metrics have a min, max, sum and count of recorded values, and are called "statistic sets" in CloudWatch.

```js
const telemetry = require('@telemetry-js/telemetry')()
const fn = require('@telemetry-js/collector-function')
const counter = require('@telemetry-js/collector-counter')
const disk = require('@telemetry-js/collector-disk')
const simple = require('@telemetry-js/schedule-simple')
const summarize = require('@telemetry-js/processor-summarize')
const tag = require('@telemetry-js/processor-ec2-instance-id')
const cloudwatch = require('@telemetry-js/publisher-cloudwatch')
const appoptics = require('@telemetry-js/publisher-appoptics')

// Example of custom metric that takes value from a function
const rand = fn.sync('myapp.random.count', { unit: 'count' }, Math.random)
const errors = counter.delta('myapp.errors.delta')

telemetry.task()
  .collect(rand)
  .collect(errors)
  .collect(disk, { metrics: ['*.percent'] })
  .schedule(simple, { interval: '30s' })
  .process(summarize, { window: '5m' })
  .process(tag)
  .publish(cloudwatch)
  .publish(appoptics, { token: '***' })

await telemetry.start()

// Elsewhere in your app
errors.increment(1)
```

### But I Just Want To Publish A One-Time Metric

Got you:

```js
const appoptics = require('@telemetry-js/publisher-appoptics')
const single = require('@telemetry-js/metric').single

const publisher = appoptics({ token: '***' })
const metric = single('myapp.example.count', { unit: 'count', value: 2 })

publisher.publish(metric)

await publisher.flush()
```

## Available Plugins

### Collectors

| Name                              | Description                          |
| :-------------------------------- | :----------------------------------- |
| [disk][collector-disk]            | Free, available and total disk space |
| [net][collector-net]              | TCP, UDP, ICMP, IP metrics           |
| [sockstat][collector-sockstat]    | `/proc/net/sockstat` metrics         |
| [nodejs-gc][collector-nodejs-gc]  | Node.js garbage collection duration  |
| [nodejs-memory][coll-nodemem]     | Node.js memory (RSS, heap, external) |
| [nodejs-event-loop-duration][eld] | Node.js event loop duration          |
| [nodejs-event-loop-lag][ell]      | Node.js event loop lag               |
| [osmem][collector-osmem]          | Free, used and total memory          |
| [counter][collector-counter]      | A counter incremented by you         |
| [function][collector-function]    | Collect metric value from a function |
| [redis][collector-redis]          | Redis metrics                        |
| [incidental][collector-incident]  | Record incidental values             |
| [stopwatch][collector-stopwatch]  | Record durations                     |
| [aws-lb][collector-aws-lb]        | AWS LB node count                    |
| [dmesg][collector-dmesg]          | Count certain kernel messages        |

### Schedules

| Name                      | Description                         |
| :------------------------ | :---------------------------------- |
| [simple][schedule-simple] | Collect metrics on a fixed interval |

### Processors

| Name                                    | Description                                        |
| :-------------------------------------- | :------------------------------------------------- |
| [summarize][proc-summarize]             | Locally summarize metrics within a time window     |
| [tag][processor-tag]                    | Add your own tags                                  |
| [ecs-tags][proc-ecs-tags]               | Add common tags for ECS container                  |
| [ec2-instance-id][proc-ec2i-id]         | Add `instanceid` tag, fetched from metadata        |
| [ec2-instance-tags][proc-ec2i-tags]     | Copy all instance tags, fetched from EC2 API       |
| [ec2-instance-name][proc-ec2i-name]     | Copy only the `name` tag (if set)                  |
| [ec2-instance-region][proc-ec2i-region] | Add `region` tag, fetched from metadata            |
| [debug][plugin-debug]                   | Log metrics and task lifecycle events with `debug` |

### Publishers

| Name                                       | Description                                        |
| :----------------------------------------- | :------------------------------------------------- |
| [appoptics][publisher-appoptics]           | AppOptics                                          |
| [cloudwatch][publisher-cloudwatch]         | CloudWatch                                         |
| [logzio-metrics][publisher-logzio-metrics] | Logz.io Metrics                                    |
| [ndjson][publisher-ndjson]                 | Write NDJSON to a stream                           |
| [debug][plugin-debug]                      | Log metrics and task lifecycle events with `debug` |

## Naming Guide

### Metric Names

Lowercase, namespaced by dots (e.g. `myapp.foo.bar.count`), prefixed with project (`myapp.`), suffixed with unit (`.count`).

Metric names from Telemetry plugins are prefixed with `telemetry`. Custom metrics of your app should be prefixed with your appname. If however, your custom metric is not app-specific, then you could instead use metrics tags to differentiate apps and/or runtime contexts. You might as well write a Telemetry plugin at that point. Do it!

### Metric Tags

Lowercase, only `a-z`. E.g. `instanceid`, `name`, `project`, `environment`.

### Plugin Package Names

Follow the format `<role>-<name>`, where:

- `<role>` is one of `collector`, `processor`, `publisher`, `schedule`, or, if the plugin serves multiple roles, then simply `plugin`
- `<name>` typically matches the metric name (for collectors), purpose (for processors) or publisher name. If the plugin is a collector that emits multiple metrics (e.g. `disk.free.bytes`, `disk.total.bytes`) then use the longest common prefix as `<name>` (e.g. `disk`).

## API

_Yet to document._

## Install

With [npm](https://npmjs.org) do:

```
npm install @telemetry-js/telemetry
```

## Acknowledgements

This project is kindly sponsored by [Reason Cybersecurity Inc](https://reasonsecurity.com).

[![reason logo](https://cdn.reasonsecurity.com/github-assets/reason_signature_logo.png)](https://reasonsecurity.com)

## License

[MIT](LICENSE) © Vincent Weevers

[collector-counter]: https://github.com/telemetry-js/collector-counter

[collector-disk]: https://github.com/telemetry-js/collector-disk

[collector-function]: https://github.com/telemetry-js/collector-function

[collector-net]: https://github.com/telemetry-js/collector-net

[collector-sockstat]: https://github.com/telemetry-js/collector-sockstat

[collector-nodejs-gc]: https://github.com/telemetry-js/collector-nodejs-gc

[eld]: https://github.com/telemetry-js/collector-nodejs-event-loop-duration

[ell]: https://github.com/telemetry-js/collector-nodejs-event-loop-lag

[collector-redis]: https://github.com/telemetry-js/collector-redis

[collector-incident]: https://github.com/telemetry-js/collector-incidental

[collector-stopwatch]: https://github.com/telemetry-js/collector-stopwatch

[collector-aws-lb]: https://github.com/telemetry-js/collector-aws-lb

[collector-dmesg]: https://github.com/telemetry-js/collector-dmesg

[coll-nodemem]: https://github.com/telemetry-js/collector-nodejs-memory

[collector-osmem]: https://github.com/telemetry-js/collector-osmem

[schedule-simple]: https://github.com/telemetry-js/schedule-simple

[proc-ecs-tags]: https://github.com/telemetry-js/processor-ecs-tags

[proc-ec2i-id]: https://github.com/telemetry-js/processor-ec2-instance-id

[proc-ec2i-tags]: https://github.com/telemetry-js/processor-ec2-instance-tags

[proc-ec2i-name]: https://github.com/telemetry-js/processor-ec2-instance-name

[proc-ec2i-region]: https://github.com/telemetry-js/processor-ec2-instance-region

[proc-summarize]: https://github.com/telemetry-js/processor-summarize

[processor-tag]: https://github.com/telemetry-js/processor-tag

[publisher-appoptics]: https://github.com/telemetry-js/publisher-appoptics

[publisher-cloudwatch]: https://github.com/telemetry-js/publisher-cloudwatch

[publisher-logzio-metrics]: https://github.com/telemetry-js/publisher-logzio-metrics

[publisher-ndjson]: https://github.com/telemetry-js/publisher-ndjson

[plugin-debug]: https://github.com/telemetry-js/plugin-debug
