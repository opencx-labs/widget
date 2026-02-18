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

export function getTranslation(
  key: TranslationKeyU,
  lang: Language,
  overrides: WidgetConfig['translationOverrides'],
): string {
  return overrides?.[lang]?.[key] || languages[lang][key] || '';
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
};
export type TranslationKeyU = keyof TranslationInterface;
