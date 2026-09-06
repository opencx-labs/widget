/**
 * The v5 stream's protocol-level data parts the client classifies a stream by.
 * Neither renders anything: the widget only needs to recognise them.
 */

/**
 * The idle heartbeat. While a request waits — a message waiting to join the
 * session's live turn, or a turn that has not spoken yet — the backend emits
 * one so an idle timeout never cuts the connection. It is a `transient`
 * part: the protocol delivers it and never adds it to the message. Readers
 * that classify a stream by its first chunk must skip it.
 */
export const isAgentStreamKeepalive = (part: { type: string }): boolean =>
  part.type === 'data-keepalive';

/**
 * The stream's answer to a message POSTed while the session already had a
 * live turn: the message was STEERED into that turn (no new turn, no reply
 * of its own — the live turn's single reply answers both messages). The
 * request's own stream carries exactly this part and ends.
 */
export const isTurnSteeredPart = (part: { type: string }): boolean =>
  part.type === 'data-turn-steered';
