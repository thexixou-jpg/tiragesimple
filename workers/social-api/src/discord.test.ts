import { describe, expect, it } from 'vitest';
import { parseDiscordMessageUrl } from './discord';

describe('parseDiscordMessageUrl', () => {
  it('accepts a complete guild message link', () => expect(parseDiscordMessageUrl('https://discord.com/channels/12345678901234567/22345678901234567/32345678901234567')).toEqual({ guildId:'12345678901234567', channelId:'22345678901234567', messageId:'32345678901234567' }));
  it('rejects DMs and foreign hosts', () => {
    expect(parseDiscordMessageUrl('https://discord.com/channels/@me/22345678901234567/32345678901234567')).toBeNull();
    expect(parseDiscordMessageUrl('https://example.com/channels/12345678901234567/22345678901234567/32345678901234567')).toBeNull();
  });
});
