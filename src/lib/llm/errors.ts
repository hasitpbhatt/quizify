export class AuthError extends Error {
  constructor(msg = 'API key rejected') {
    super(msg);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(msg = 'Rate limited — try again in a moment') {
    super(msg);
    this.name = 'RateLimitError';
  }
}

export class ParseError extends Error {
  constructor(msg = 'Failed to parse LLM response') {
    super(msg);
    this.name = 'ParseError';
  }
}

export class NetworkError extends Error {
  constructor(msg = 'Network request failed') {
    super(msg);
    this.name = 'NetworkError';
  }
}
