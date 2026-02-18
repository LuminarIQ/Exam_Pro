let sdk: any = null;

export async function startTracing() {
  if (process.env.OTEL_ENABLED !== 'true') return;
  if (sdk) return;

  const { diag, DiagConsoleLogger, DiagLogLevel } = require('@opentelemetry/api');
  const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
  const { NodeSDK } = require('@opentelemetry/sdk-node');
  const { Resource } = require('@opentelemetry/resources');
  const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

  if (process.env.OTEL_DEBUG === 'true') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME || 'adaptive-tutor-api',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
}

export async function shutdownTracing() {
  if (!sdk) return;
  await sdk.shutdown();
  sdk = null;
}
