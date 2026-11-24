// FAKE credentials for scanner testing only. None of these are real.
module.exports = {
  // VULNERABILITY: Hardcoded AWS access key (fake, AWS documentation example)
  AWS_ACCESS_KEY_ID: 'REDACTED',
  AWS_SECRET_ACCESS_KEY: 'REDACTED',

  // VULNERABILITY: Hardcoded GitHub token (fake)
  GITHUB_TOKEN: 'REDACTED',

  // VULNERABILITY: Hardcoded Stripe live key (fake)
  STRIPE_KEY: 'REDACTED',

  // VULNERABILITY: Database URL with embedded password (fake)
  DATABASE_URL: 'REDACTED'
};
