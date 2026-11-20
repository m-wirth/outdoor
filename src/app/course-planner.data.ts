import { JsFramework, JsFrameworkId } from './course-planner.models';

type GoalRow = [code: string, area: string, topic: string, text: string];

function framework(id: JsFrameworkId, name: string, shortName: string, rows: GoalRow[]): JsFramework {
  return {
    id,
    name,
    shortName,
    goals: rows.map(([code, area, topic, text]) => ({ id: `${id}:${code}`, code, area, topic, text }))
  };
}

export const JS_FRAMEWORKS: JsFramework[] = [
  framework('js-leitendenkurs-lst', 'J+S-Leitendenkurs Lagersport/Trekking', 'Leitendenkurs LS/T', [
    ['1.1', 'Sich als J+S-Leitende engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, das J+S-Ausbildungsverständnis für die Sportart Lagersport/Trekking zu beschreiben.'],
    ['1.2', 'Sich als J+S-Leitende engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, ihre Rechte, Pflichten und Verantwortung als J+S-Leitende zu benennen und nach diesen zu handeln.'],
    ['1.3', 'Sich als J+S-Leitende engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, das eigene Handeln in der Rolle als J+S-Leitende zu reflektieren und Erkenntnisse für ihre Praxis abzuleiten.'],
    ['1.4', 'Sich als J+S-Leitende engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, ihre eigene Weiterbildung im J+S-System zu planen.'],
    ['1.5', 'Sich als J+S-Leitende engagieren', 'Verständnis von J+S als Organisation', 'Die Teilnehmenden sind fähig, die Ziele, Strukturen, Leistungen von J+S und für sie relevante J+S-Bestimmungen zu benennen.'],
    ['1.6', 'Sich als J+S-Leitende engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, die Grundsätze von fairem, verantwortungsvollem und förderndem Sport zu benennen und diese als J+S-Leiter*in vorzuleben.'],
    ['1.7', 'Sich als J+S-Leitende engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, Situationen und das eigene Verhalten anhand der Farben des Ethik-Kompasses einzuordnen.'],
    ['1.8', 'Sich als J+S-Leitende engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, die Verhaltensgrundsätze für die J+S-Kaderbildung im Rahmen des Kurses einzuhalten.'],
    ['1.9', 'Sich als J+S-Leitende engagieren', 'Zielgruppengerechtigkeit', 'Die Teilnehmenden sind fähig, das Programm ausgerichtet auf den Entwicklungsstand und die Fähigkeiten der von ihnen betreuten Kinder und Jugendlichen zu gestalten.'],
    ['1.10', 'Sich als J+S-Leitende engagieren', 'Lagerplanung', 'Die Teilnehmenden sind fähig, LS/T-Lager mitzuplanen und ihre Rolle als J+S-Leitende in einem Lagerleitungsteam wahrzunehmen.'],
    ['2.1', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, die Erscheinungsformen der Sportart LS/T präzise zu beschreiben.'],
    ['2.2', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, den Zusammenhang zwischen den Aktivitätsformen und den Erscheinungsformen zu erläutern.'],
    ['2.3', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, die J+S-Bewegungs- und Spielgrundformen zu benennen.'],
    ['2.4', 'Lagersport Trekking verstehen', 'Sportfachtechniken', 'Die Teilnehmenden sind fähig, die vorgegebenen sportfachtechnischen Grundlagen in LS/T anzuleiten.'],
    ['3.1', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte J+S-Aktivitäten zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.2', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte Unternehmungen mit Übernachtung zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.3', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, die in der Sportart LS/T relevanten Aktivitätsformen im Rahmen ihrer J+S-Aktivitäten angemessen anzuleiten.'],
    ['3.4', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, bei der Planung und Durchführung von J+S-Lagern die Bedeutung von Ritualen zu berücksichtigen.'],
    ['3.5', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, für eigene J+S-Aktivitäten Gefahren zu erkennen, Risiken einzuschätzen und entsprechende Massnahmen abzuleiten.'],
    ['3.6', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, das Programm situativ angepasst zu leiten und in einem Notfall angemessen zu reagieren.'],
    ['3.7', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, ihre Kompetenzen in Bezug auf Sicherheit aufgrund von erlebten sicherheitsrelevanten Situationen kritisch zu reflektieren.'],
    ['3.8', 'Lagersport Trekking unterrichten', 'Betreuung', 'Die Teilnehmenden sind fähig, auf herausfordernde Situationen mit Kindern und Jugendlichen konstruktiv zu reagieren.'],
    ['3.9', 'Lagersport Trekking unterrichten', 'Betreuung', 'Die Teilnehmenden sind fähig, im Umgang mit den von ihnen betreuten Kindern und Jugendlichen Wertschätzung vorzuleben und Begeisterung, Wohlbefinden und Zugehörigkeit zu fördern.']
  ]),
  framework('js-leitendenkurs-paedagogik-lst', 'J+S-Leitendenkurs für Personen mit pädagogischer Ausbildung Lagersport/Trekking', 'Pädagogik LS/T', [
    ['1.1', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, das J+S-Ausbildungsverständnis für die Sportart Lagersport/Trekking zu beschreiben.'],
    ['1.2', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, ihre eigene Weiterbildung im J+S-System zu planen.'],
    ['1.3', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Verständnis von J+S als Organisation', 'Die Teilnehmenden sind fähig, die Ziele, Strukturen, Leistungen von J+S und für sie relevante J+S-Bestimmungen zu benennen.'],
    ['1.4', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, unter Berücksichtigung des Lernbausteins «Wertvoller Sport» in eigenen Worten aufzuzeigen, was «wertvollen Sport» ausmacht und wie dieser als J+S-Lagerleiter*in konkret gefördert werden kann.'],
    ['1.5', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, Situationen und das eigene Verhalten anhand der Farben des Ethik-Kompasses einzuordnen und angemessene Handlungsmöglichkeiten abzuleiten.'],
    ['1.6', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, die Verhaltensgrundsätze für die J+S-Kaderbildung im Rahmen des Kurses einzuhalten.'],
    ['1.7', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Lagerplanung', 'Die Teilnehmenden sind fähig, unter Einhaltung der J+S-Bestimmungen LS/T-Lager zu planen.'],
    ['1.8', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Lagerplanung', 'Die Teilnehmenden sind fähig, in Zusammenarbeit mit dem*der J+S-Coach ein J+S-Lager korrekt zu administrieren.'],
    ['2.1', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, die Erscheinungsformen der Sportart LS/T präzise zu beschreiben.'],
    ['2.2', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, den Zusammenhang zwischen den Aktivitätsformen und den Erscheinungsformen zu erläutern.'],
    ['2.3', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, die J+S-Bewegungs- und Spielgrundformen zu benennen.'],
    ['2.4', 'Lagersport Trekking verstehen', 'Erscheinungs- und Aktivitätsformen', 'Die Teilnehmenden sind fähig, Aktivitätsformen so einzusetzen und zu gestalten, dass die Erscheinungsformen der Sportart LS/T im Lagerprogramm bewusst erlebbar und beobachtbar werden.'],
    ['2.5', 'Lagersport Trekking verstehen', 'Sportfachtechniken', 'Die Teilnehmenden sind fähig, die vorgegebenen sportfachtechnischen Grundlagen in LS/T anzuleiten.'],
    ['3.1', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte J+S-Aktivitäten zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.2', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte Unternehmungen mit Übernachtung zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.3', 'Lagersport Trekking unterrichten', 'Programmgestaltung', 'Die Teilnehmenden sind fähig, die in der Sportart LS/T relevanten Aktivitätsformen im Rahmen ihrer J+S-Aktivitäten angemessen anzuleiten.'],
    ['3.4', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte J+S-Lager unter Einbezug des Leitungsteams zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.5', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, Höhepunkte für die Lagerteilnehmenden und Mitleitenden bewusst zu planen.'],
    ['3.6', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, für eigene J+S-Aktivitäten und ein J+S-Lager Gefahren zu erkennen, Risiken einzuschätzen und entsprechende Massnahmen abzuleiten.'],
    ['3.7', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, das Lager situativ angepasst zu leiten und eine Notfallsituation angemessen zu koordinieren.'],
    ['3.8', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, ihre Kompetenzen in Bezug auf Sicherheit aufgrund von erlebten sicherheitsrelevanten Situationen kritisch zu reflektieren.']
  ]),
  framework('js-modul-lager-hauptleiten-lst', 'J+S-Modul Lager hauptleiten Lagersport/Trekking', 'Lager hauptleiten', [
    ['1.1', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, das J+S-Ausbildungsverständnis für die Sportart Lagersport/Trekking zu beschreiben.'],
    ['1.2', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, ihre Rechte, Pflichten und Verantwortung als J+S-Lagerhauptleitende zu benennen und nach diesen zu handeln.'],
    ['1.3', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, das eigene Handeln in der Rolle als J+S-Lagerhauptleitende zu reflektieren und Erkenntnisse für ihre Praxis abzuleiten.'],
    ['1.4', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Rollenverständnis und Selbstreflexion', 'Die Teilnehmenden sind fähig, ihre eigene Weiterbildung im J+S-System zu planen.'],
    ['1.5', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Verständnis von J+S als Organisation', 'Die Teilnehmenden sind fähig, relevante Neuerungen von J+S sowie des eigenen Verbandes zu wiederholen.'],
    ['1.6', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, unter Berücksichtigung des Lernbausteins «Wertvoller Sport» in eigenen Worten aufzuzeigen, was «wertvollen Sport» ausmacht und wie dieser als J+S-Lagerleiter*in konkret gefördert werden kann.'],
    ['1.7', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, Situationen und das eigene Verhalten anhand der Farben des Ethik-Kompasses einzuordnen und angemessene Handlungsmöglichkeiten abzuleiten.'],
    ['1.8', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Ethisches Handeln', 'Die Teilnehmenden sind fähig, die Verhaltensgrundsätze für die J+S-Kaderbildung im Rahmen des Moduls einzuhalten.'],
    ['1.9', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Zielgruppengerechtigkeit', 'Die Teilnehmenden sind fähig, das Lagerprogramm ausgerichtet auf den Entwicklungsstand und die Fähigkeiten der von ihnen betreuten Kinder und Jugendlichen zu gestalten.'],
    ['1.10', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Lagerplanung', 'Die Teilnehmenden sind fähig, unter Einhaltung der J+S-Bestimmungen LS/T-Lager zu planen.'],
    ['1.11', 'Sich als J+S-Leiterin oder J+S-Leiter engagieren', 'Lagerplanung', 'Die Teilnehmenden sind fähig, in Zusammenarbeit mit dem*der J+S-Coach ein J+S-Lager korrekt zu administrieren.'],
    ['2.1', 'Lagersport Trekking verstehen', 'Aktivitätsformen', 'Die Teilnehmenden sind fähig, Aktivitätsformen so einzusetzen und zu gestalten, dass die Erscheinungsformen der Sportart LS/T im Lagerprogramm bewusst erlebbar und beobachtbar werden.'],
    ['3.1', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, vielseitige und strukturierte J+S-Lager unter Einbezug des Leitungsteams zu planen, diese angepasst durchzuführen und zielgerichtet auszuwerten.'],
    ['3.2', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, Höhepunkte für die Lagerteilnehmenden und Mitleitenden bewusst zu planen.'],
    ['3.3', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, in LS/T-Lager bewusst Rituale einzubauen und dabei deren Bedeutung kritisch zu hinterfragen.'],
    ['3.4', 'Lagersport Trekking unterrichten', 'Lagergestaltung', 'Die Teilnehmenden sind fähig, einzelne J+S-Aktivitäten des Leitungsteams auf Basis der J+S-Bestimmungen zu beurteilen.'],
    ['3.5', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, für ein J+S-Lager Gefahren zu erkennen, Risiken einzuschätzen und entsprechende Massnahmen abzuleiten.'],
    ['3.6', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, das Lager situativ angepasst zu leiten und eine Notfallsituation angemessen zu koordinieren.'],
    ['3.7', 'Lagersport Trekking unterrichten', 'Sicherheit', 'Die Teilnehmenden sind fähig, ihre Kompetenzen in Bezug auf Sicherheit aufgrund von erlebten sicherheitsrelevanten Situationen kritisch zu reflektieren.'],
    ['3.8', 'Lagersport Trekking unterrichten', 'Teamleitung', 'Die Teilnehmenden sind fähig, auf herausfordernde Situationen in der Lagergemeinschaft und im Leitungsteam konstruktiv zu reagieren.'],
    ['3.9', 'Lagersport Trekking unterrichten', 'Teamleitung', 'Die Teilnehmenden sind fähig, die konstruktive Zusammenarbeit im Leitungsteam zu fördern.'],
    ['3.10', 'Lagersport Trekking unterrichten', 'Teamleitung', 'Die Teilnehmenden sind fähig, dem Leitungsteam in ihrer Rolle als J+S-Lagerhauptleitende zeitnahe, zielorientierte und konstruktive Rückmeldungen zu geben.']
  ])
];

export const FRAMEWORK_BY_ID = new Map(JS_FRAMEWORKS.map((item) => [item.id, item]));

