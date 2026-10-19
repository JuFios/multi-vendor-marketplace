import { Injectable } from '@nestjs/common';
import type { Counter, Histogram } from '@prometheus-io/client';
import { InjectMetric } from '@willsoto/nestjs-prometheus';

import { HTTP_REQUEST_DURATION_SECONDS, HTTP_REQUESTS_TOTAL } from './metrics.constants';

export interface HttpRequestSample {
  method: string;
  route: string;
  status: number;
  durationSeconds: number;
}

type HttpLabel = 'method' | 'route' | 'status';

@Injectable()
export class HttpMetricsService {
  constructor(
    @InjectMetric(HTTP_REQUESTS_TOTAL) private readonly requests: Counter<HttpLabel>,
    @InjectMetric(HTTP_REQUEST_DURATION_SECONDS) private readonly duration: Histogram<HttpLabel>,
  ) {}

  record({ method, route, status, durationSeconds }: HttpRequestSample): void {
    const labels = { method, route, status: String(status) };
    this.requests.inc(labels);
    this.duration.observe(labels, durationSeconds);
  }
}
