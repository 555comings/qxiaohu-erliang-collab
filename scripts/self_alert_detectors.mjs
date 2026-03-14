function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function firstNonEmptyLine(value) {
  return normalizeText(value).split('\n').find(Boolean) || '';
}

function slugify(value, fallback = 'none') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function createCandidate(signalType, topicScope, evidence, extra = {}) {
  return {
    signalType,
    topicScope,
    evidence: normalizeText(evidence),
    errorSignature: extra.errorSignature || 'none',
    summary: extra.summary || '',
    routeHint: extra.routeHint || null,
    metadata: extra.metadata || {},
    ...extra
  };
}

export function detectUserCandidates(input) {
  const text = typeof input === 'string' ? input : input?.text;
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const topicScope = input?.topicScope || 'user-input';
  const candidates = [];

  if (normalized.includes('记一下') || /记住这个|记住这条/.test(normalized)) {
    candidates.push(createCandidate(
      'remember_request',
      topicScope,
      normalized,
      {
        summary: 'User explicitly asked to remember something.',
        errorSignature: 'remember-request'
      }
    ));
  }

  if (/(?:^|[\s\n，。！？；;,:])不对(?:$|[\s\n，。！？；;,:])/.test(` ${normalized} `) || /应该说|不是你/.test(normalized)) {
    candidates.push(createCandidate(
      'user_correction',
      topicScope,
      normalized,
      {
        summary: 'User issued a factual or relationship correction.',
        errorSignature: slugify(firstNonEmptyLine(normalized), 'user-correction')
      }
    ));
  }

  if (/以后/.test(normalized) && /(别|不要|别再)/.test(normalized)) {
    candidates.push(createCandidate(
      'preference_correction',
      topicScope,
      normalized,
      {
        summary: 'User corrected a style or preference rule.',
        errorSignature: slugify(firstNonEmptyLine(normalized), 'preference-correction')
      }
    ));
  }

  const deduped = dedupeCandidates(candidates);
  const hasSpecificCorrection = deduped.some((candidate) =>
    candidate.signalType === 'user_correction' || candidate.signalType === 'preference_correction');

  if (!hasSpecificCorrection) {
    return deduped;
  }

  return deduped.filter((candidate) => candidate.signalType !== 'remember_request');
}

function detectHighRiskGit(command, evidence, topicScope) {
  const patterns = [
    /git\s+push\s+.*(?:--force|-f)(?:\s|$)/i,
    /git\s+checkout\s+-f(?:\s|$)/i,
    /git\s+reset\s+--hard(?:\s|$)/i,
    /git\s+clean\s+-fd(?:\s|$)/i,
    /git\s+checkout\s+[^\n]+\s+--\s+/i
  ];

  if (!patterns.some((pattern) => pattern.test(command))) {
    return null;
  }

  return createCandidate(
    'high_risk_git',
    topicScope,
    evidence,
    {
      summary: 'Detected a high-risk git command.',
      errorSignature: slugify(command, 'high-risk-git')
    }
  );
}

function detectExecError(event, topicScope, evidence) {
  const exitCode = Number(event.exitCode);
  if (!Number.isFinite(exitCode) || exitCode === 0) {
    return null;
  }

  const detail = firstNonEmptyLine(event.stderr || event.errorMessage || event.stdout || String(exitCode));
  const knownSandboxLimit = /sandbox|permission denied|approval|access is denied|operation not permitted/i.test(detail);

  return createCandidate(
    'exec_error',
    topicScope,
    evidence,
    {
      summary: 'exec returned a non-zero exit code.',
      errorSignature: slugify(detail, `exit-${exitCode}`),
      knownSandboxLimit
    }
  );
}

function detectWriteFailure(event, topicScope, evidence) {
  const failed = event.success === false || Boolean(event.errorMessage);
  if (!failed) {
    return null;
  }

  const detail = firstNonEmptyLine(event.errorMessage || evidence);
  return createCandidate(
    'write_failure',
    topicScope,
    evidence,
    {
      summary: 'Write/edit operation failed.',
      errorSignature: slugify(detail, 'write-failure')
    }
  );
}

export function detectToolCandidates(event) {
  if (!event || typeof event !== 'object') {
    return [];
  }

  const toolName = event.toolName || event.tool || 'tool';
  const topicScope = event.topicScope || `${toolName}-result`;
  const command = normalizeText(event.command || '');
  const evidence = normalizeText([
    toolName ? `tool=${toolName}` : '',
    command ? `command=${command}` : '',
    event.errorMessage ? `error=${event.errorMessage}` : '',
    event.stderr ? `stderr=${event.stderr}` : '',
    Number.isFinite(Number(event.exitCode)) ? `exitCode=${event.exitCode}` : ''
  ].filter(Boolean).join('\n'));

  const candidates = [];
  const highRiskGit = detectHighRiskGit(command, evidence || command, topicScope);
  if (highRiskGit) {
    candidates.push(highRiskGit);
  }

  if (toolName === 'exec') {
    const execError = detectExecError(event, topicScope, evidence || command);
    if (execError) {
      candidates.push(execError);
    }
  }

  if (toolName === 'write' || toolName === 'edit') {
    const writeFailure = detectWriteFailure(event, topicScope, evidence || event.errorMessage);
    if (writeFailure) {
      candidates.push(writeFailure);
    }
  }

  return dedupeCandidates(candidates);
}

export function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = [candidate.signalType, candidate.topicScope, candidate.errorSignature].join('::');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
