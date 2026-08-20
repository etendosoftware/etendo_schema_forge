export async function clearEmailSink(request, baseURL = 'http://127.0.0.1:8025') {
  const response = await request.delete(`${baseURL}/messages`);
  if (!response.ok() && response.status() !== 204) {
    throw new Error(`Email sink reset failed with HTTP ${response.status()}`);
  }
}

export async function waitForEmail(request, {
  recipient,
  template,
  baseURL = 'http://127.0.0.1:8025',
  timeoutMs = 20_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request.get(`${baseURL}/messages`);
    if (!response.ok()) {
      throw new Error(`Email sink read failed with HTTP ${response.status()}`);
    }
    const { messages = [] } = await response.json();
    const message = messages.find((candidate) => {
      const recipientMatches = !recipient
        || candidate.to === recipient
        || candidate.to?.includes?.(recipient);
      return recipientMatches && (!template || candidate.template === template);
    });
    if (message) return message;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${template || 'email'} to ${recipient || 'any recipient'}`);
}

export function invitationLinkFromEmail(message) {
  const link = message?.data?.link;
  if (typeof link !== 'string' || !/^https?:\/\//.test(link)) {
    throw new Error('company-invitation email did not contain an absolute data.link');
  }
  if (!/\/invite\?token=[^&]+/.test(link)) {
    throw new Error(`company-invitation email contained an unexpected link: ${link}`);
  }
  return link;
}
