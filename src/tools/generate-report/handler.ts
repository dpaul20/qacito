import fs from 'node:fs/promises';
import path from 'node:path';
import type { GenerateReportInput, GenerateReportOutput, GenerateReportError } from './schema.js';
import { getRun, type RunDetail, type TestResult } from '../../dashboard-server/run-store.js';
import { getDashboardUrl } from '../../dashboard-server/index.js';
import { resolveSafe } from '../../shared/sandbox.js';

// ---------------------------------------------------------------------------
// Markdown builder
// ---------------------------------------------------------------------------

function statusIcon(status: string): string {
  if (status === 'passed') return '✅';
  if (status === 'failed') return '❌';
  if (status === 'blocked') return '🚫';
  if (status === 'timeout') return '⏱️';
  return '⚠️';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildMarkdown(run: RunDetail): string {
  const date = new Date(run.startedAt).toLocaleDateString('es-AR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const specName = path.basename(run.specPath);
  const icon = statusIcon(run.status);

  const lines: string[] = [
    `# QAcito Test Report`,
    ``,
    `## Metadata`,
    ``,
    `| Campo | Valor |`,
    `|-------|-------|`,
    `| Proyecto | \`${path.basename(run.projectRoot)}\` |`,
    `| Fecha | ${date} |`,
    `| Spec | \`${specName}\` |`,
    `| Run ID | \`${run.id}\` |`,
    ``,
    `## Resumen`,
    ``,
    `| Total | ✅ Pasó | ❌ Falló | ⏩ Skipped | Duración |`,
    `|-------|---------|---------|----------|----------|`,
    `| ${run.total} | ${run.passed} | ${run.failed} | ${run.skipped} | ${formatDuration(run.durationMs)} |`,
    ``,
    `**Estado general**: ${icon} ${run.status.toUpperCase()}`,
    ``,
    `## Resultados por Test`,
    ``,
  ];

  if (run.tests.length === 0) {
    lines.push('_No se registraron tests individuales._', '');
  } else {
    for (const t of run.tests) {
      lines.push(`### ${statusIcon(t.status)} ${t.title}`);
      lines.push(`- **Status**: ${t.status}`);
      lines.push(`- **Duración**: ${formatDuration(t.durationMs)}`);
      if (t.error) {
        lines.push(`- **Error**:`);
        lines.push(`  \`\`\``);
        lines.push(`  ${t.error.slice(0, 500)}`);
        lines.push(`  \`\`\``);
      }
      lines.push('');
    }
  }

  // Key findings
  const failedTests = run.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
  lines.push(`## Hallazgos Clave`);
  lines.push('');
  if (failedTests.length === 0 && run.status === 'passed') {
    lines.push('✅ Todos los tests pasaron correctamente. No se encontraron issues.');
  } else if (failedTests.length > 0) {
    lines.push(`**${failedTests.length} test(s) fallaron.** Posibles causas:`);
    lines.push('');
    const errors = new Set(failedTests.map((t) => t.error?.split('\n')[0] ?? '').filter(Boolean));
    for (const err of errors) {
      lines.push(`- ${err}`);
    }
    lines.push('');
    lines.push('**Próximos pasos:**');
    lines.push('');
    lines.push('1. Revisar los errores detallados por test en la sección anterior.');
    lines.push('2. Verificar que la aplicación está corriendo en la URL correcta.');
    lines.push('3. Revisar si los selectores o rutas cambiaron recientemente.');
  } else {
    lines.push(`⚠️ La suite terminó con status \`${run.status}\`. Revisar los logs.`);
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function buildHtml(run: RunDetail, markdown: string): string {
  const specName = path.basename(run.specPath);
  const date = new Date(run.startedAt).toLocaleString('es-AR');
  const statusColor = run.status === 'passed' ? '#22c55e' : run.status === 'failed' ? '#ef4444' : '#f97316';

  const testRows = run.tests.map((t) => {
    const color = t.status === 'passed' ? '#22c55e' : t.status === 'failed' ? '#ef4444' : '#f97316';
    const errorHtml = t.error
      ? `<pre style="background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;white-space:pre-wrap;">${escHtml(t.error.slice(0, 500))}</pre>`
      : '';
    return `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">
        <span style="display:inline-block;padding:2px 10px;border-radius:12px;background:${color}20;color:${color};font-size:12px;font-weight:600;">${t.status.toUpperCase()}</span>
      </td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-size:14px;">${escHtml(t.title)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">${formatDuration(t.durationMs)}</td>
    </tr>
    ${errorHtml ? `<tr><td colspan="3" style="padding:0 10px 10px;">${errorHtml}</td></tr>` : ''}`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>QAcito Report — ${escHtml(specName)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f9fafb; color: #111827; }
    .container { max-width: 900px; margin: 0 auto; padding: 32px 16px; }
    .header { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    .header h1 { font-size: 20px; font-weight: 700; color: #111827; }
    .header .meta { font-size: 13px; color: #6b7280; }
    .status-badge { padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; background: ${statusColor}20; color: ${statusColor}; }
    .card { background: #fff; border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #374151; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; }
    .summary-item { text-align: center; padding: 16px; border-radius: 8px; background: #f3f4f6; }
    .summary-item .value { font-size: 28px; font-weight: 700; }
    .summary-item .label { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .pass { color: #22c55e; } .fail { color: #ef4444; } .skip { color: #f97316; } .total { color: #3b82f6; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 10px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e5e7eb; }
    .findings { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .findings h2 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
    .findings p, .findings li { font-size: 14px; color: #374151; line-height: 1.6; }
    .findings ul { padding-left: 20px; margin-top: 8px; }
    .footer { text-align: center; margin-top: 32px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <div>
      <h1>QAcito Test Report</h1>
      <p class="meta">${escHtml(specName)} &nbsp;·&nbsp; ${escHtml(date)}</p>
    </div>
    <span class="status-badge">${run.status.toUpperCase()}</span>
  </div>

  <div class="card">
    <h2>Resumen</h2>
    <div class="summary-grid">
      <div class="summary-item"><div class="value total">${run.total}</div><div class="label">Total</div></div>
      <div class="summary-item"><div class="value pass">${run.passed}</div><div class="label">✅ Pasó</div></div>
      <div class="summary-item"><div class="value fail">${run.failed}</div><div class="label">❌ Falló</div></div>
      <div class="summary-item"><div class="value skip">${run.skipped}</div><div class="label">⏩ Skipped</div></div>
      <div class="summary-item"><div class="value" style="font-size:18px;">${formatDuration(run.durationMs)}</div><div class="label">Duración</div></div>
    </div>
  </div>

  ${run.tests.length > 0 ? `
  <div class="card">
    <h2>Resultados por Test</h2>
    <table>
      <thead><tr><th>Estado</th><th>Test</th><th>Duración</th></tr></thead>
      <tbody>${testRows}</tbody>
    </table>
  </div>` : ''}

  <div class="findings">
    <h2>Hallazgos Clave</h2>
    ${buildFindingsHtml(run)}
  </div>

  <p class="footer">Generado por QAcito &nbsp;·&nbsp; Run ID: ${escHtml(run.id)}</p>
</div>
</body>
</html>`;
}

function buildFindingsHtml(run: RunDetail): string {
  const failed = run.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut');
  if (failed.length === 0 && run.status === 'passed') {
    return '<p>✅ Todos los tests pasaron correctamente. No se encontraron issues.</p>';
  }
  if (failed.length > 0) {
    const errors = [...new Set(failed.map((t) => t.error?.split('\n')[0] ?? '').filter(Boolean))];
    return `<p><strong>${failed.length} test(s) fallaron.</strong></p>
    ${errors.length > 0 ? `<ul>${errors.map((e) => `<li>${escHtml(e)}</li>`).join('')}</ul>` : ''}
    <p style="margin-top:12px;"><strong>Próximos pasos:</strong></p>
    <ul>
      <li>Revisar los errores detallados en la sección de resultados.</li>
      <li>Verificar que la aplicación está corriendo en la URL correcta.</li>
      <li>Revisar si los selectores o rutas cambiaron recientemente.</li>
    </ul>`;
  }
  return `<p>⚠️ La suite terminó con status <code>${escHtml(run.status)}</code>. Revisar los logs.</p>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function generateReportHandler(
  input: GenerateReportInput,
): Promise<GenerateReportOutput | GenerateReportError> {
  const run = getRun(input.runId);
  if (!run) {
    return { error: 'RunNotFound', runId: input.runId };
  }

  const safeOutputDir = resolveSafe(run.projectRoot, input.outputDir);

  try {
    await fs.access(safeOutputDir);
  } catch {
    throw new Error(`Output directory not found: "${input.outputDir}"`);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = `qacito-report-${timestamp}`;
  const mdPath = path.join(safeOutputDir, `${baseName}.md`);
  const htmlPath = path.join(safeOutputDir, `${baseName}.html`);

  const markdown = buildMarkdown(run);
  const html = buildHtml(run, markdown);

  await Promise.all([
    fs.writeFile(mdPath, markdown, 'utf-8'),
    fs.writeFile(htmlPath, html, 'utf-8'),
  ]);

  const baseUrl = getDashboardUrl();
  return {
    mdPath,
    htmlPath,
    dashboardUrl: baseUrl ? `${baseUrl}/run/${run.id}` : '',
  };
}
