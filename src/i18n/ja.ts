/**
 * Japanese review translation of src/i18n/en.ts. Each entry keeps a copy of
 * the English it translates (`en`): when the English changes, the entry is
 * stale, the app shows English for it and the tests fail until it is
 * translated again (update both `en` and `ja`).
 *
 * Pure data (type-only import).
 */
import type { Key } from './en.ts';

export const JA: Partial<Record<Key, { en: string; ja: string }>> = {
  "guide.intro.1": {
    en: "Welcome aboard the Currency Time Machine!",
    ja: "Currency Time Machineへようこそ！",
  },
  "guide.intro.2": {
    en: "I'm Tock, your guide to the history of money.",
    ja: "ぼくはトック。お金の歴史を案内するガイドです。",
  },
  "guide.intro.3": {
    en: "Pick a year, and we'll travel back to see who shaped the world, what happened, and how currencies changed.",
    ja: "年を選んでください。その年へさかのぼって、世界を動かした人々、起きた出来事、通貨の変化を見に行きましょう。",
  },
  "guide.select": {
    en: "Which year shall we visit? Turn the dial, or pick a famous year. Then press Start Travel.",
    ja: "どの年を訪れましょうか？ダイヤルを回すか、有名な年を選んでください。それから「出発（Start Travel）」を押してください。",
  },
  "guide.warp": {
    en: "Hold on tight! Setting the dial to {year}...",
    ja: "しっかりつかまって！ダイヤルを{year}年に合わせます…",
  },
  "guide.arrive": {
    en: "Here we are: {year}.",
    ja: "着きました。{year}年です。",
  },
  "guide.full": {
    en: "The full journey: every year from 1948 to today, in about four minutes. Pinch a currency to hear it alone.",
    ja: "全期間の旅：1948年から現在までのすべての年を、約4分でたどります。通貨をつまむと、その通貨の音だけが聞こえます。",
  },
  "guide.noEvents": {
    en: "Our history file has no verified event for this year, so let us watch the currencies themselves.",
    ja: "この年について、歴史ファイルに確認済みの出来事はありません。そこで、通貨そのものの動きを見ていきましょう。",
  },
  "guide.ongoing": {
    en: "This year is not over yet: our data runs to {date}.",
    ja: "この年はまだ終わっていません。データは{date}までです。",
  },
  "guide.peopleHidden": {
    en: "Names and portraits are not shown in this version.",
    ja: "この版では名前と肖像は表示しません。",
  },
  "guide.opening": {
    en: "{year}. {era}. {text}",
    ja: "{year}年。{era}。{text}",
  },
  "guide.lookAt": {
    en: "This year, let's look at {places}.",
    ja: "この年は、{places}を見ていきましょう。",
  },
  "guide.explore": {
    en: "{sentence} Pinch it again to go on.",
    ja: "{sentence}もう一度つまむと先へ進みます。",
  },
  "story.1971": {
    en: "1971. For more than twenty years, most major currencies have been fixed to the dollar, and the dollar to gold. This is the year that system breaks.",
    ja: "1971年。20年以上にわたり、主要通貨の多くはドルに、ドルは金に固定されてきました。この年、その仕組みが崩れます。",
  },
  "story.1985": {
    en: "1985. The dollar is strong.{since} In September, five major economies say other currencies should rise against it, and stand ready to cooperate.",
    ja: "1985年。ドルが強い時代です。{since}9月、主要5か国は、ほかの通貨がドルに対して上昇すべきだと表明し、協力する用意があるとします。",
  },
  "story.1985.since": {
    en: " Since 1980 the Mark has lost {mark}% of its value against it, and the yen {yen}%.",
    ja: "1980年以降、ドルに対してマルクは価値の{mark}%を、円は{yen}%を失っています。",
  },
  "story.1997": {
    en: "1997. From the middle of this year, money flows out of several East and Southeast Asian economies, and their currencies fall. Watch South Korea.",
    ja: "1997年。この年の半ばから、東アジアと東南アジアのいくつかの経済から資金が流出し、その通貨が下落します。韓国に注目しましょう。",
  },
  "story.2008": {
    en: "2008. A financial crisis that began in the United States is about to spread around the world.",
    ja: "2008年。米国で始まった金融危機が、いま世界に広がろうとしています。",
  },
  "story.2022": {
    en: "2022. Prices rise fast around the world, and central banks raise interest rates. Watch the yen.",
    ja: "2022年。世界中で物価が急速に上がり、中央銀行は金利を引き上げます。円に注目しましょう。",
  },
  "leaders.system": {
    en: "{name}. {system}",
    ja: "{name}。{system}",
  },
  "leaders.lookFor": {
    en: "In {name}, look for {titles}.",
    ja: "{name}では、{titles}に注目します。",
  },
  "leaders.office": {
    en: "the {title}",
    ja: "{title}",
  },
  "leaders.none": {
    en: "In {name}, we have no verified record of who governed this year.",
    ja: "{name}について、この年に誰が統治していたかの確認済みの記録はありません。",
  },
  "leaders.in": {
    en: "In {name}: {parts}.",
    ja: "{name}では、{parts}です。",
  },
  "leaders.inEuroArea": {
    en: "In the euro area: {parts}.",
    ja: "ユーロ圏では、{parts}です。",
  },
  "leaders.inSwitzerland": {
    en: "In Switzerland, the Federal Council governs together: {parts}.",
    ja: "スイスでは連邦参事会が合議で統治します。{parts}です。",
  },
  "leaders.then": {
    en: "{first}, then {rest}",
    ja: "{first}（のちに{rest}）",
  },
  "leaders.sep": {
    en: "; ",
    ja: "、",
  },
  "role.default": {
    en: "{title} {who}",
    ja: "{title}は{who}",
  },
  "role.us-president": {
    en: "President {who}",
    ja: "大統領は{who}",
  },
  "role.us-fed": {
    en: "{who} chairs the Federal Reserve",
    ja: "連邦準備制度理事会（FRB）議長は{who}",
  },
  "role.ca-pm": {
    en: "Prime Minister {who}",
    ja: "首相は{who}",
  },
  "role.ca-boc": {
    en: "{who} leads the Bank of Canada",
    ja: "カナダ銀行総裁は{who}",
  },
  "role.uk-pm": {
    en: "Prime Minister {who}",
    ja: "首相は{who}",
  },
  "role.uk-boe": {
    en: "{who} leads the Bank of England",
    ja: "イングランド銀行総裁は{who}",
  },
  "role.de-chancellor": {
    en: "Chancellor {who}",
    ja: "首相は{who}",
  },
  "role.de-bundesbank": {
    en: "{who} leads the Bundesbank",
    ja: "ドイツ連邦銀行総裁は{who}",
  },
  "role.ea-ecb": {
    en: "{who} leads the European Central Bank",
    ja: "欧州中央銀行（ECB）総裁は{who}",
  },
  "role.ch-president": {
    en: "{who} presides over the Federal Council",
    ja: "連邦参事会の議長（連邦大統領）は{who}",
  },
  "role.ch-snb": {
    en: "{who} leads the Swiss National Bank",
    ja: "スイス国立銀行総裁は{who}",
  },
  "role.in-pm": {
    en: "Prime Minister {who}",
    ja: "首相は{who}",
  },
  "role.in-rbi": {
    en: "{who} leads the Reserve Bank of India",
    ja: "インド準備銀行総裁は{who}",
  },
  "role.cn-chairman": {
    en: "{who} leads the Communist Party",
    ja: "共産党を率いるのは{who}",
  },
  "role.cn-gensec": {
    en: "{who} leads the Communist Party",
    ja: "共産党を率いるのは{who}",
  },
  "role.cn-premier": {
    en: "Premier {who}",
    ja: "国務院総理（首相）は{who}",
  },
  "role.cn-pboc": {
    en: "{who} leads the People's Bank of China",
    ja: "中国人民銀行総裁は{who}",
  },
  "role.kr-president": {
    en: "President {who}",
    ja: "大統領は{who}",
  },
  "role.kr-bok": {
    en: "{who} leads the Bank of Korea",
    ja: "韓国銀行総裁は{who}",
  },
  "role.jp-pm": {
    en: "Prime Minister {who}",
    ja: "首相は{who}",
  },
  "role.jp-boj": {
    en: "{who} leads the Bank of Japan",
    ja: "日本銀行総裁は{who}",
  },
  "role.au-pm": {
    en: "Prime Minister {who}",
    ja: "首相は{who}",
  },
  "role.au-rba": {
    en: "{who} leads the Reserve Bank of Australia",
    ja: "オーストラリア準備銀行総裁は{who}",
  },
  "event.line": {
    en: "{date}: {title}. {summary}",
    ja: "{date}：{title}。{summary}",
  },
  "event.people": {
    en: " Among those involved: {people}.",
    ja: "関係者：{people}。",
  },
  "event.watch": {
    en: " Watch {currencies}.",
    ja: "{currencies}に注目してください。",
  },
  "event.undatedMonth": {
    en: "Also in {month}, on a day our sources do not give: {title}. {summary}",
    ja: "{month}には、出典に日付の記載がない出来事もありました：{title}。{summary}",
  },
  "event.undatedYear": {
    en: "Also in {year}, on a date our sources do not give: {title}. {summary}",
    ja: "{year}年には、出典に日付の記載がない出来事もありました：{title}。{summary}",
  },
  "cur.CAD": {
    en: "the Canadian dollar",
    ja: "カナダドル",
  },
  "cur.GBP": {
    en: "the pound",
    ja: "ポンド",
  },
  "cur.DEM": {
    en: "the Mark",
    ja: "マルク",
  },
  "cur.EUR": {
    en: "the euro",
    ja: "ユーロ",
  },
  "cur.CHF": {
    en: "the Swiss franc",
    ja: "スイスフラン",
  },
  "cur.INR": {
    en: "the rupee",
    ja: "ルピー",
  },
  "cur.CNY": {
    en: "the yuan",
    ja: "人民元",
  },
  "cur.KRW": {
    en: "the won",
    ja: "ウォン",
  },
  "cur.JPY": {
    en: "the yen",
    ja: "円",
  },
  "cur.AUD": {
    en: "the Australian dollar",
    ja: "豪ドル",
  },
  "result.overYear": {
    en: "Over the year",
    ja: "この1年で",
  },
  "result.soFar": {
    en: "So far this year",
    ja: "今年これまでに",
  },
  "result.both": {
    en: "{span}, {up} gained the most against the dollar, {upPct}, and {down} lost the most, {downPct}.",
    ja: "{span}、ドルに対して最も上昇したのは{up}（{upPct}）、最も下落したのは{down}（{downPct}）でした。",
  },
  "result.up": {
    en: "{span}, {up} gained the most against the dollar, {upPct}.",
    ja: "{span}、ドルに対して最も上昇したのは{up}（{upPct}）でした。",
  },
  "result.down": {
    en: "{span}, {down} lost the most against the dollar, {downPct}. None of the others gained more than 1%.",
    ja: "{span}、ドルに対して最も下落したのは{down}（{downPct}）でした。ほかに1%を超えて上昇した通貨はありません。",
  },
  "result.flat": {
    en: "{span}, the currencies we follow barely moved against the dollar.",
    ja: "{span}、ここで追う通貨はドルに対してほとんど動きませんでした。",
  },
  "joins": {
    en: "{currency} joins our data here, at {rate} {code} per US dollar.",
    ja: "{currency}のデータはここから始まります。1米ドル＝{rate} {code}です。",
  },
  "sharpest.gained": {
    en: "Look at {currency}: in the eight weeks to {month}, it gained {pct} against the dollar.",
    ja: "{currency}に注目してください。{month}までの8週間で、ドルに対して{pct}上昇しました。",
  },
  "sharpest.lost": {
    en: "Look at {currency}: in the eight weeks to {month}, it lost {pct} against the dollar.",
    ja: "{currency}に注目してください。{month}までの8週間で、ドルに対して{pct}下落しました。",
  },
  "summary.titles": {
    en: "That was {year}: {titles}.",
    ja: "これが{year}年でした：{titles}。",
  },
  "summary.plain": {
    en: "That was {year}.",
    ja: "これが{year}年でした。",
  },
  "summary.line": {
    en: "{head} {result} Where shall we go next?",
    ja: "{head}{result}次はどこへ行きましょうか？",
  },
  "date.duringYear": {
    en: "During the year",
    ja: "年内（日付不明）",
  },
  "undated.year": {
    en: "Our sources give the year only, not the date.",
    ja: "出典には年だけが記載され、日付はありません。",
  },
  "undated.month": {
    en: "Our sources give the month only, not the day.",
    ja: "出典には月だけが記載され、日はありません。",
  },
  "obs.undated": {
    en: "{note} The year does not stop for it, and the chart has no marker.",
    ja: "{note}この出来事では年の進行は止まらず、グラフにも印は付きません。",
  },
  "obs.none": {
    en: "No exchange-rate observation after this date yet.",
    ja: "この日付より後の為替レートの観測値はまだありません。",
  },
  "obs.same": {
    en: "Exchange rates are weekly: the year stops at the observation of the same day, {date}.",
    ja: "為替レートは週次です。同じ日、{date}の観測値で年の進行が止まります。",
  },
  "obs.after": {
    en: "Event on {event}. Exchange rates are weekly: the year stops at the first observation after it, {date}.",
    ja: "出来事の日付は{event}。為替レートは週次のため、その後最初の観測日、{date}で年の進行が止まります。",
  },
  "src.reviewed": {
    en: "Reviewed against quoted sources: {list}",
    ja: "引用した出典と照合済み：{list}",
  },
  "src.primary": {
    en: "{names} (primary)",
    ja: "{names}（一次資料）",
  },
  "src.matched": {
    en: "Matched automatically: a passage of {names} gives {what} (not reviewed by hand)",
    ja: "自動照合：{names}の一節に{what}の記載あり（人による確認なし）",
  },
  "src.what.year": {
    en: "this year",
    ja: "この年",
  },
  "src.what.month": {
    en: "this month",
    ja: "この月",
  },
  "src.what.date": {
    en: "this date",
    ja: "この日付",
  },
  "src.label": {
    en: "Source: {text}",
    ja: "出典：{text}",
  },
  "term.since": {
    en: "since {year}",
    ja: "{year}年から",
  },
  "term.months": {
    en: "{from} to {to} {year}",
    ja: "{year}年{from}～{to}",
  },
  "term.years": {
    en: "{from} to {to}",
    ja: "{from}～{to}年",
  },
  "select.title": {
    en: "CHOOSE A YEAR TO VISIT",
    ja: "訪れる年を選んでください",
  },
  "select.decade": {
    en: "{decade}s",
    ja: "{decade}年代",
  },
  "select.fullJourney": {
    en: "Full Journey",
    ja: "全期間の旅",
  },
  "select.fullJourneySub": {
    en: "1948 to today",
    ja: "1948年から現在まで",
  },
  "select.calm": {
    en: "Calm motion",
    ja: "動きを抑える",
  },
  "select.on": {
    en: "on",
    ja: "オン",
  },
  "select.off": {
    en: "off",
    ja: "オフ",
  },
  "select.start": {
    en: "Start Travel  ▶",
    ja: "出発  ▶",
  },
  "select.what": {
    en: "{year}: what happened",
    ja: "{year}年の出来事",
  },
  "select.none": {
    en: "No verified event is recorded for this year in our history file. You can still travel there: the guide shows who led the countries and how their currencies moved.",
    ja: "この年について、歴史ファイルに確認済みの出来事は記録されていません。それでも旅はできます。ガイドが各国の指導者と通貨の動きを紹介します。",
  },
  "select.event": {
    en: "{date}: {title}",
    ja: "{date}：{title}",
  },
  "select.eventPlaces": {
    en: "{places}  ·  Currencies to watch: {currencies}",
    ja: "{places}  ·  注目の通貨：{currencies}",
  },
  "select.more": {
    en: "+ {n} more on the journey",
    ja: "ほか{n}件は旅の中で",
  },
  "select.dataBegins": {
    en: "Our data begins on {date}, {year}",
    ja: "データは{year}年{date}から",
  },
  "select.yearToDate": {
    en: "Year to date: data to {date}, {year}",
    ja: "年初来：データは{year}年{date}まで",
  },
  "select.slotBegins": {
    en: "{code} data begins {date}",
    ja: "{code}のデータは{date}から",
  },
  "select.slotFrom": {
    en: "{code} from {year}",
    ja: "{code}は{year}年から",
  },
  "quick.1971": {
    en: "Dollar-gold break",
    ja: "ドルと金の分離",
  },
  "quick.1985": {
    en: "Plaza Accord",
    ja: "プラザ合意",
  },
  "quick.1997": {
    en: "Asian crisis",
    ja: "アジア通貨危機",
  },
  "quick.2008": {
    en: "Financial crisis",
    ja: "金融危機",
  },
  "quick.2022": {
    en: "Yen slides",
    ja: "円の下落",
  },
  "skipIntro": {
    en: "Skip intro",
    ja: "イントロをスキップ",
  },
  "panel.grab": {
    en: "Grab to move",
    ja: "つまんで移動",
  },
  "panel.reset": {
    en: "Reset",
    ja: "元に戻す",
  },
  "tock.touch": {
    en: "Touch Tock!",
    ja: "Tockにさわってみて！",
  },
  "tock.highFive": {
    en: "High five!",
    ja: "ハイタッチ！",
  },
  "captions.speaker": {
    en: "TOCK",
    ja: "トック",
  },
  "stage.placesToWatch": {
    en: "PLACES TO WATCH",
    ja: "注目する地域",
  },
  "stage.thisYear": {
    en: "THIS YEAR",
    ja: "この年の出来事",
  },
  "stage.noEvent": {
    en: "No verified event recorded for this year.",
    ja: "この年の確認済みの出来事は記録されていません。",
  },
  "stage.note": {
    en: "Exchange rates: weekly observations (Fridays), {from} to {to}{ytd}. {events}",
    ja: "為替レート：週次の観測値（金曜日）、{from}～{to}{ytd}。{events}",
  },
  "stage.ytd": {
    en: " (year to date)",
    ja: "（年初来）",
  },
  "stage.eventsNone": {
    en: "No verified events this year.",
    ja: "この年の確認済みの出来事はありません。",
  },
  "stage.eventsReviewed1": {
    en: "1 event reviewed against quoted sources",
    ja: "1件の出来事を引用した出典と照合済み",
  },
  "stage.eventsReviewedN": {
    en: "{n} events reviewed against quoted sources",
    ja: "{n}件の出来事を引用した出典と照合済み",
  },
  "stage.eventsMatched": {
    en: "{n} matched automatically to a Wikipedia passage",
    ja: "{n}件はWikipediaの一節と自動照合",
  },
  "stage.eventsSep": {
    en: "; ",
    ja: "、",
  },
  "stage.eventsEnd": {
    en: "{text}.",
    ja: "{text}。",
  },
  "stage.peopleHidden": {
    en: "Names and portraits are not shown in this version.",
    ja: "この版では名前と肖像は表示しません。",
  },
  "stage.noRecord": {
    en: "No verified record for this year.",
    ja: "この年の確認済みの記録はありません。",
  },
  "stage.gap": {
    en: "No verified record: {spans}",
    ja: "確認済みの記録なし：{spans}",
  },
  "stage.gapSpan": {
    en: "{from} to {to}",
    ja: "{from}～{to}",
  },
  "stage.currency": {
    en: "CURRENCY",
    ja: "通貨",
  },
  "stage.usdBase": {
    en: "The US dollar is the base: every other currency is measured against it.",
    ja: "米ドルが基準です。ほかのすべての通貨はドルに対して測ります。",
  },
  "stage.dataBeginsIn": {
    en: "Our data for this currency begins in {year}.",
    ja: "この通貨のデータは{year}年から始まります。",
  },
  "stage.dataBegins": {
    en: "Data begins {date}.",
    ja: "データは{date}から。",
  },
  "stage.rateOn": {
    en: "{date}: {rate} {code} per USD",
    ja: "{date}：1米ドル＝{rate} {code}",
  },
  "stage.rateNow": {
    en: "Now ({date}): {rate} {code} per USD",
    ja: "現在（{date}）：1米ドル＝{rate} {code}",
  },
  "stage.changeYear": {
    en: "{pct} vs USD over the year ({dir})",
    ja: "対ドルで{pct}（この1年、{dir}）",
  },
  "stage.changeSoFar": {
    en: "{pct} vs USD so far ({dir})",
    ja: "対ドルで{pct}（ここまで、{dir}）",
  },
  "stage.stronger": {
    en: "stronger",
    ja: "通貨高",
  },
  "stage.weaker": {
    en: "weaker",
    ja: "通貨安",
  },
  "stage.photo": {
    en: "Photo: {artist} · {license} · Wikimedia Commons",
    ja: "写真：{artist} · {license} · Wikimedia Commons",
  },
  "stage.currenciesToWatch": {
    en: "CURRENCIES TO WATCH",
    ja: "注目の通貨",
  },
  "stage.places": {
    en: "Places: {places}",
    ja: "地域：{places}",
  },
  "stage.yearInReview": {
    en: "YEAR IN REVIEW",
    ja: "この1年のまとめ",
  },
  "stage.noEventShort": {
    en: "No verified event recorded.",
    ja: "確認済みの出来事の記録はありません。",
  },
  "stage.changeVsUsd": {
    en: "CHANGE VS US DOLLAR",
    ja: "対米ドルの変化",
  },
  "stage.period": {
    en: "{from} to {to}{ytd}",
    ja: "{from}～{to}{ytd}",
  },
  "stage.placesHead": {
    en: "PLACES",
    ja: "地域",
  },
  "stage.policymakers": {
    en: "KEY POLICYMAKERS",
    ja: "主な政策担当者",
  },
  "stage.personOffice": {
    en: "{name}, {office}",
    ja: "{name}（{office}）",
  },
  "stage.lateChange": {
    en: "{code}: {pct} from {date} (data begins; not ranked)",
    ja: "{code}：{date}から{pct}（データ開始；順位の対象外）",
  },
  "stage.anotherYear": {
    en: "Explore another year",
    ja: "別の年を探索",
  },
  "stage.prevYear": {
    en: "◀  Previous year",
    ja: "◀  前の年",
  },
  "stage.nextYear": {
    en: "Next year  ▶",
    ja: "次の年  ▶",
  },
  "stage.replay": {
    en: "Replay this year",
    ja: "この年をもう一度",
  },
  "stage.fullJourney": {
    en: "Full Journey",
    ja: "全期間の旅",
  },
  "portal.photos": {
    en: "{country}  ·  photos {period}",
    ja: "{country}  ·  {period}の写真",
  },
  "portal.pinch": {
    en: "Pinch for people, policies and sources",
    ja: "つまむと人物・政策・出典を表示",
  },
  "portal.policies": {
    en: "Policies",
    ja: "政策",
  },
  "portal.portrait": {
    en: "Portrait: {license}",
    ja: "肖像：{license}",
  },
  "portal.people": {
    en: "People",
    ja: "人物",
  },
  "portal.impression": {
    en: "Artistic impression, not a photograph",
    ja: "芸術的なイメージ図（写真ではありません）",
  },
  "portal.photoCredits": {
    en: "Photos: {credits}. Wikimedia Commons.",
    ja: "写真：{credits}。Wikimedia Commons。",
  },
  "portal.portraits": {
    en: "Portraits via Wikimedia Commons: {list}.",
    ja: "肖像（Wikimedia Commons）：{list}。",
  },
  "portal.checked": {
    en: "Offices checked against Wikidata or Wikipedia; see docs/history-verification.md. Pinch again to close.",
    ja: "役職はWikidataまたはWikipediaで確認済み（docs/history-verification.md参照）。もう一度つまむと閉じます。",
  },
  "portal.readoutAt": {
    en: "{word} {rate}{date} per USD",
    ja: "{word}：1米ドル＝{rate}{date}",
  },
  "portal.readout": {
    en: "{word} {from}{fromDate} → {to}{toDate} per USD ({pct}% vs USD)",
    ja: "{word}：1米ドル＝{from}{fromDate} → {to}{toDate}（対ドル{pct}%）",
  },
  "era.howTo": {
    en: "How to explore",
    ja: "操作方法",
  },
  "era.era": {
    en: "The era",
    ja: "時代",
  },
  "era.today": {
    en: "Today",
    ja: "現在",
  },
  "ending.unavailable": {
    en: "Live rates are unavailable. This is the last week in our history.",
    ja: "ライブのレートを取得できません。これは履歴データの最後の週です。",
  },
  "ending.saved": {
    en: "Saved rates from {date}",
    ja: "{date}に保存したレート",
  },
  "ending.mixed": {
    en: "Each line ends at its latest rate; some are from {date}. Pinch a currency for details.",
    ja: "各線は最新のレートで終わります。一部は{date}時点のものです。通貨をつまむと詳細を表示します。",
  },
  "ending.bundled": {
    en: "Live rates are unavailable right now. Pinch a currency to hear its latest move.",
    ja: "いまはライブのレートを取得できません。通貨をつまむと、その最新の動きが聞こえます。",
  },
  "ending.live": {
    en: "This is the world of money right now. Pinch a currency to hear how it moved since yesterday.",
    ja: "これが現在の通貨の世界です。通貨をつまむと、昨日からの動きが聞こえます。",
  },
  "chart.today": {
    en: "Today · {date} {year}",
    ja: "現在 · {year}年{date}",
  },
  "chart.headerYear": {
    en: "Change in value vs {base} since {since} (the year's first weekly observation) · one scale · up = stronger",
    ja: "{since}（年の最初の週次観測）からの{base}に対する価値の変化 · 共通の目盛り · 上＝通貨高",
  },
  "chart.headerFull": {
    en: "Change in value vs {base} over the last {months} months · one scale for all · up = stronger than the dollar",
    ja: "直近{months}か月の{base}に対する価値の変化 · 全通貨共通の目盛り · 上＝ドルに対して通貨高",
  },
  "chart.offScale": {
    en: "  off scale",
    ja: "  目盛りの外",
  },
  "chart.lateNote": {
    en: "* {codes}: change since its data begins (inside this window)",
    ja: "* {codes}：データ開始時点からの変化（この期間内に開始）",
  },
  "chart.clippedNote": {
    en: "{code} is off the scale; its label gives the true change",
    ja: "{code}は目盛りの外です。ラベルの数値が実際の変化です",
  },
  "chart.soloRecent": {
    en: "{pct}% in {months} months, ",
    ja: "{months}か月で{pct}%、",
  },
  "chart.soloToday": {
    en: "{title}: {recent}{from} to {to}: {day}% vs {base}",
    ja: "{title}：{recent}{from}～{to}：対{base}で{day}%",
  },
  "chart.soloBegins": {
    en: "{title}: data begins in {year}",
    ja: "{title}：データは{year}年から",
  },
  "chart.soloSince": {
    en: "{pct}% vs {base} since {since}",
    ja: "{since}から対{base}で{pct}%",
  },
  "chart.soloSinceBegins": {
    en: "its data begins ({date})",
    ja: "データ開始（{date}）",
  },
  "chart.soloYear": {
    en: "{title}: {change} · now {rate} {code} per {base}  (pinch again to hear all)",
    ja: "{title}：{change} · 現在 1{base}＝{rate} {code}  （もう一度つまむと全通貨に戻ります）",
  },
  "chart.soloSpanLate": {
    en: "since its data begins ({year})",
    ja: "データ開始（{year}年）から",
  },
  "chart.soloSpan": {
    en: "in {months} months",
    ja: "{months}か月で",
  },
  "chart.soloChange": {
    en: "{pct}% vs {base} {span}",
    ja: "{span}対{base}で{pct}%",
  },
  "chart.soloFull": {
    en: "{title}: {change} · since {from}: {total}%  (pinch again to hear all)",
    ja: "{title}：{change} · {from}年から{total}%  （もう一度つまむと全通貨に戻ります）",
  },
  "ending.fetched": {
    en: "{date}, {time} UTC",
    ja: "{date} {time}（UTC）",
  },
  "lang.button": {
    en: "Lang: {lang}",
    ja: "Lang: {lang}",
  },
  "map.noteYear": {
    en: "Markers show each currency's home, not where it is traded. Change vs USD since the year's first week.",
    ja: "マーカーは各通貨の本拠地を示し、取引される場所ではありません。年の最初の週からの対ドルの変化。",
  },
  "map.noteFull": {
    en: "Markers show each currency's home, not where it is traded. Change vs USD over the chart's 52 weeks.",
    ja: "マーカーは各通貨の本拠地を示し、取引される場所ではありません。グラフの52週間での対ドルの変化。",
  },
  "map.credit": {
    en: "Map: Natural Earth",
    ja: "地図：Natural Earth",
  },
  "map.base": {
    en: "base",
    ja: "基準",
  },
  "map.usdPlace": {
    en: "United States · the base",
    ja: "米国 · 基準通貨",
  },
  "map.dataFrom": {
    en: "data from {year}",
    ja: "{year}年からのデータ",
  },
  "start.lead": {
    en: "Travel through time. Meet the people, explore the events, and discover how currencies changed. Headphones recommended.",
    ja: "時間を旅しましょう。人々に会い、出来事を探り、通貨がどう変わったかを発見します。ヘッドホン推奨。",
  },
  "start.year": {
    en: "Year Journey",
    ja: "1年の旅",
  },
  "start.yearSub": {
    en: "Pick a year; a guide robot shows you around (about 2 minutes)",
    ja: "年を選ぶと、ガイドロボットが案内します（約2分）",
  },
  "start.full": {
    en: "Full Journey",
    ja: "全期間の旅",
  },
  "start.fullSub": {
    en: "Every year from 1948 to today (about 4 minutes)",
    ja: "1948年から現在までのすべての年（約4分）",
  },
  "start.voice": {
    en: "Guide voice in English (subtitles always on)",
    ja: "ガイドの英語音声（字幕は常に表示）",
  },
  "start.calm": {
    en: "Calm motion",
    ja: "動きを抑える",
  },
  "start.resetPanel": {
    en: "Reset the hand panel",
    ja: "手元パネルの位置を元に戻す",
  },
  "start.panelReset": {
    en: "The hand panel is back in its place.",
    ja: "手元パネルを元の位置に戻しました。",
  },
  "start.language": {
    en: "Language",
    ja: "表示言語",
  },
  "start.languageNote": {
    en: "Japanese is a review translation of the English subtitles and panels; the voice stays English.",
    ja: "日本語は、英語の字幕とパネルを確認するためのレビュー用翻訳です。音声は英語のままです。",
  },
  "start.enterVr": {
    en: "Enter VR",
    ja: "VRに入る",
  },
  "start.watch": {
    en: "Watch in browser",
    ja: "ブラウザで見る",
  },
  "start.loading": {
    en: "Loading...",
    ja: "読み込み中...",
  },
  "start.failed": {
    en: "Something went wrong while loading. Please reload the page.",
    ja: "読み込み中に問題が発生しました。ページを再読み込みしてください。",
  },
  "start.noVr": {
    en: "VR needs a headset: open this page in the Meta Quest Browser. On this device, use Watch in browser.",
    ja: "VRにはヘッドセットが必要です。Meta Questのブラウザでこのページを開いてください。この端末では「ブラウザで見る」をお使いください。",
  },
  "start.vrFailed": {
    en: "VR could not start on this device. Use Watch in browser, or open this page in the Meta Quest Browser.",
    ja: "この端末ではVRを開始できませんでした。「ブラウザで見る」を使うか、Meta Questのブラウザでこのページを開いてください。",
  },
  "start.credit": {
    en: "Exchange rate data: Frankfurter (frankfurter.dev)",
    ja: "為替レートデータ：Frankfurter（frankfurter.dev）",
  },
};
