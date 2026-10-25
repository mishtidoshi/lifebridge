"""Add to calendar: one deadline as a standard .ics file (RFC 5545) that every calendar app opens.

The file holds only the deadline itself (its name, date, note, and official link), never
anything about the person. For dates the user typed in from a letter, only that date is used.
"""

import datetime

from engine.facts import text


def _escape(value):
    return value.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def _fold(line):
    """Lines longer than 75 bytes are split, as the format requires."""
    out, data = [], line.encode("utf-8")
    while len(data) > 75:
        cut = 75
        while (data[cut] & 0xC0) == 0x80:  # don't split a multi-byte character
            cut -= 1
        out.append(data[:cut].decode("utf-8"))
        data = b" " + data[cut:]
    out.append(data.decode("utf-8"))
    return "\r\n".join(out)


def deadline_ics(pack, deadline, day, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    note = text(deadline.get("note") or "")
    source = deadline.get("source_url")
    description = " ".join(x for x in (note, f"Official source: {source}" if source else "", "From LifeBridge.") if x)
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//LifeBridge//Deadlines//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{pack['id']}-{deadline['id']}-{day.isoformat()}@lifebridge",
        f"DTSTAMP:{now.strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART;VALUE=DATE:{day.strftime('%Y%m%d')}",
        f"DTEND;VALUE=DATE:{(day + datetime.timedelta(days=1)).strftime('%Y%m%d')}",
        f"SUMMARY:{_escape('Deadline: ' + text(deadline['label']))}",
        f"DESCRIPTION:{_escape(description)}",
    ]
    if source:
        lines.append(f"URL:{source}")
    lines += [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{_escape(text(deadline['label']) + ' is in 3 days')}",
        "TRIGGER:-P3D",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
