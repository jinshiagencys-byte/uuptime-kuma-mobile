module.exports = ({ config }) => {
  const relayUrl = process.env.RELAY_URL || '';
  const relaySecret = process.env.RELAY_SECRET || '';

  return {
    ...config,
    extra: {
      ...config.extra,
      relayUrl,
      relaySecret,
    },
  };
};
