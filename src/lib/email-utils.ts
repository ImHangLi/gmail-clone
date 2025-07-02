export const extractNameFromEmail = (emailString: string | null): string => {
  if (!emailString) return "Unknown Sender";

  // Check if it's in format "Name <email@domain.com>"
  const nameRegex = /^(.+?)\s*<.*>$/;
  const nameMatch = nameRegex.exec(emailString);
  if (nameMatch?.[1]) {
    return nameMatch[1].trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
  }

  // If it's just an email address, extract the part before @
  const emailRegex = /^([^@<]+)@/;
  const emailMatch = emailRegex.exec(emailString);
  if (emailMatch?.[1]) {
    return emailMatch[1].trim();
  }

  return emailString.trim();
}

export const extractEmailAddress = (from: string): string => {
  const match = /<([^>]+)>/.exec(from);
  return match ? (match[1] ?? "") : from;
};

export const extractAllEmailAddresses = (email: {
  from?: string | null;
  to?: string | null;
  cc?: string | null;
}): string[] => {
  const addresses = new Set<string>();
  if (email.from) addresses.add(extractEmailAddress(email.from));
  if (email.to)
    email.to.split(",").forEach((e) => addresses.add(extractEmailAddress(e)));
  if (email.cc)
    email.cc.split(",").forEach((e) => addresses.add(extractEmailAddress(e)));
  return Array.from(addresses);
};

export const formatSubject = (subject: string, prefix = "Re:"): string => {
  if (subject.startsWith(prefix)) {
    return subject;
  }
  return `${prefix} ${subject}`;
};

export const formatForwardBody = (email: {
  from?: string | null;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  receivedAt?: Date;
  htmlBody?: string;
}): string => {
  return `
\n---------- Forwarded message --------
From: ${email.from ?? ""}
Date: ${email.receivedAt?.toLocaleString() ?? ""}
Subject: ${email.subject ?? ""}
To: ${email.to ?? ""}
${email.cc ? `Cc: ${email.cc}` : ""}\n${email.htmlBody ?? ""}
  `;
};
