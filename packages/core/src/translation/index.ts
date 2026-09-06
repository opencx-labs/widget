import type { WidgetConfig } from '../types/widget-config';
import { ArabicLanguage } from './ar';
import { BengaliLanguage } from './bn';
import { BulgarianLanguage } from './bg';
import { CzechLanguage } from './cs';
import { DanishLanguage } from './da';
import { GreekLanguage } from './el';
import { GermanLanguage } from './de';
import { EnglishLanguage } from './en';
import { SpanishLanguage } from './es';
import { FilipinoLanguage } from './fil';
import { FinnishLanguage } from './fi';
import { FrenchLanguage } from './fr';
import { HindiLanguage } from './hi';
import { ItalianLanguage } from './it';
import { JapaneseLanguage } from './ja';
import { KoreanLanguage } from './ko';
import { DutchLanguage } from './nl';
import { NorwegianLanguage } from './no';
import { PolishLanguage } from './pl';
import { PortugueseLanguage } from './pt';
import { RomanianLanguage } from './ro';
import { SwedishLanguage } from './sv';
import { RussianLanguage } from './ru';
import { ThaiLanguage } from './th';
import { TurkishLanguage } from './tr';
import { UrduLanguage } from './ur';
import { VietnameseLanguage } from './vi';
import { ChineseSimplifiedLanguage } from './zh-cn';
import { CroatianLanguage } from './hr';
import { EstonianLanguage } from './et';
import { HungarianLanguage } from './hu';
import { IcelandicLanguage } from './is';
import { LatvianLanguage } from './lv';
import { LithuanianLanguage } from './lt';
import { LuxembourgishLanguage } from './lb';
import { MalteseLanguage } from './mt';
import { NorwegianBokmalLanguage } from './nb';
import { SlovakLanguage } from './sk';

const languages = {
  ar: ArabicLanguage,
  bn: BengaliLanguage,
  bg: BulgarianLanguage,
  cs: CzechLanguage,
  da: DanishLanguage,
  de: GermanLanguage,
  el: GreekLanguage,
  en: EnglishLanguage,
  es: SpanishLanguage,
  et: EstonianLanguage,
  fi: FinnishLanguage,
  fil: FilipinoLanguage,
  fr: FrenchLanguage,
  hi: HindiLanguage,
  hr: CroatianLanguage,
  hu: HungarianLanguage,
  is: IcelandicLanguage,
  it: ItalianLanguage,
  ja: JapaneseLanguage,
  ko: KoreanLanguage,
  lb: LuxembourgishLanguage,
  lt: LithuanianLanguage,
  lv: LatvianLanguage,
  mt: MalteseLanguage,
  nb: NorwegianBokmalLanguage,
  nl: DutchLanguage,
  no: NorwegianLanguage,
  pl: PolishLanguage,
  pt: PortugueseLanguage,
  ro: RomanianLanguage,
  ru: RussianLanguage,
  sk: SlovakLanguage,
  sv: SwedishLanguage,
  th: ThaiLanguage,
  tr: TurkishLanguage,
  ur: UrduLanguage,
  vi: VietnameseLanguage,
  'zh-cn': ChineseSimplifiedLanguage,
} as const;

export const LANGUAGES = Object.keys(languages) as (keyof typeof languages)[];
export type Language = (typeof LANGUAGES)[number];

export function isSupportedLanguage(
  lang: string | null | undefined,
): lang is Language {
  return LANGUAGES.includes(lang as Language);
}

/** Languages written right-to-left; the widget flips its layout for them. */
const RTL_LANGUAGES: ReadonlySet<Language> = new Set<Language>(['ar', 'ur']);

export function isRtlLanguage(lang: Language): boolean {
  return RTL_LANGUAGES.has(lang);
}

/** The language the widget renders in: `config.language` when supported, else English. */
export function resolveLanguage(lang: string | null | undefined): Language {
  return isSupportedLanguage(lang) ? lang : 'en';
}

export function getTranslation(
  key: TranslationKeyU,
  lang: Language,
  overrides: WidgetConfig['translationOverrides'],
  params?: Record<string, string | number>,
): string {
  const text = overrides?.[lang]?.[key] || languages[lang][key];
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** `getTranslation` for code that holds the config rather than a language. */
export function translate(
  config: Pick<WidgetConfig, 'language' | 'translationOverrides'>,
  key: TranslationKeyU,
  params?: Record<string, string | number>,
): string {
  return getTranslation(
    key,
    resolveLanguage(config.language),
    config.translationOverrides,
    params,
  );
}

export type TranslationInterface = {
  i_need_more_help: string;
  this_was_helpful: string;
  write_a_message_placeholder: string;
  your_issue_has_been_resolved: string;
  new_conversation: string;
  back_to_conversations: string;
  closed_conversations: string;
  no_conversations_yet: string;
  welcome_screen_title: string;
  welcome_screen_description: string;
  your_name_placeholder: string;
  your_email_placeholder: string;
  optional: string;
  start_chat_button: string;
  start_chat_button_loading: string;
  csat_title: string;
  csat_submitted_title: string;
  csat_feedback_placeholder: string;
  follow_up_placeholder: string;
  companion_layout_label: string;
  companion_layout_floating: string;
  companion_layout_sidebar: string;
  companion_layout_fullscreen: string;
  companion_close: string;
  companion_history: string;
  companion_expand_chat: string;
  companion_sidebar_dock_label: string;
  companion_sidebar_side_label: string;
  companion_sidebar_left: string;
  companion_sidebar_right: string;
  companion_resize_chat: string;
  scroll_to_bottom: string;
  thinking: string;
  running: string;
  steps: string;
  step_arguments: string;
  step_result: string;
  attach_files: string;
  mark_page_active: string;
  mark_page: string;
  stop_response: string;
  copy_reply: string;
  copied: string;
  dictate: string;
  stop_dictation: string;
  dictation_mic_blocked: string;
  dictation_unavailable: string;
  send_message: string;
  upload_failed: string;
  file_rejected: string;
  remove_attachment: string;
  json_no_items: string;
  json_no_data: string;
  json_no_chart_data: string;
  json_unsupported: string;
  json_see_less: string;
  /** Subtitle of a tool-built phone-agent card. */
  json_phone_agent: string;
  /** The phone-agent card's action, completed by the host page. */
  json_phone_agent_test: string;
  /** Dismisses the composer's page-context (entity) pill for one message. */
  page_context_remove: string;
  json_see_more: string;
  page_mark_hint: string;
  page_mark_escape: string;
  page_mark_shape_box: string;
  page_mark_shape_circle: string;
  page_mark_shape_arrow: string;
  page_mark_shape_bracket: string;
  page_mark_shape_underline: string;
  page_mark_shape_highlight: string;
  page_mark_shape_strike_through: string;
  page_mark_shape_crossed_off: string;
  page_mark_shape_aria: string;
  page_mark_note_placeholder: string;
  page_mark_attach: string;
  page_mark_remove: string;
  page_mark_region: string;
  page_mark_default_message: string;
  /** Header of the multi-send queue pill above the composer. */
  queued_label: string;
  /** Accessible label of the per-message remove button in the queue pill. */
  remove_queued_message: string;
  /** Body of the error row shown when an agent turn failed to arrive. */
  turn_failed_message: string;
  /** Retry action in the failed-turn error row. */
  turn_failed_retry: string;
  /** Previous question in the agent's clarification card. */
  questions_back: string;
  /** Next question in the agent's clarification card. */
  questions_next: string;
  /** Submits every answer of the clarification card as one message. */
  questions_send: string;
  /** Escape from the offered chips into a free-text answer. */
  questions_type_answer: string;
  /** Placeholder of that free-text answer box. */
  questions_answer_placeholder: string;
};
export type TranslationKeyU = keyof TranslationInterface;
