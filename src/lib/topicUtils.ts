interface TopicInfo {
  topic: string;
  type: 'url' | 'topic' | 'book';
  sourceUrl?: string;
  extractedTitle?: string;
  category?: 'technical' | 'business' | 'academic' | 'general';
}

function detectTopicType(input: string): TopicInfo {
  const trimmed = input.trim();

  if (/^https?:\/\/\s*$/.test(trimmed)) {
    return { topic: '', type: 'url' };
  }

  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    try {
      const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
      return {
        topic: trimmed,
        type: 'url',
        sourceUrl: trimmed,
        extractedTitle: extractTitleFromUrl(url),
        category: categorizeUrl(url.hostname),
      };
    } catch {
      return { topic: trimmed, type: 'url' };
    }
  }

  const isBookPattern =
    /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+by\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/i.test(trimmed) ||
    /^(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*-\s*[A-Z][a-z]+$/i.test(trimmed);

  if (isBookPattern) {
    return {
      topic: trimmed,
      type: 'book',
      category: 'general',
    };
  }

  if (
    /^(?:[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,}|localhost|\d+\.\d+\.\d+\.\d+)$/.test(trimmed)
  ) {
    return { topic: trimmed, type: 'topic' };
  }

  return {
    topic: trimmed,
    type: 'topic',
    category: 'general',
  };
}

function extractTitleFromUrl(url: URL): string {
  const path = url.pathname.replace(/\/$/, '');
  const segments = path.split('/').filter(Boolean);

  if (segments.length > 0) {
    const lastSegment = segments[segments.length - 1];
    if (lastSegment.length > 3 && /^[a-zA-Z0-9\-]+$/.test(lastSegment)) {
      return lastSegment
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
  }

  const hostname = url.hostname.replace(/^www\./, '');
  const domainParts = hostname.split('.');
  if (domainParts.length >= 2) {
    const domain = domainParts[domainParts.length - 2];
    return domain.charAt(0).toUpperCase() + domain.slice(1).replace(/-/g, ' ');
  }

  return hostname.charAt(0).toUpperCase() + hostname.slice(1);
}

function categorizeUrl(hostname: string): 'technical' | 'business' | 'academic' | 'general' {
  const lower = hostname.toLowerCase();

  if (lower.includes('github') || lower.includes('stackoverflow') || lower.includes('tech')) {
    return 'technical';
  }

  if (lower.includes('medium') || lower.includes('forbes') || lower.includes('business')) {
    return 'business';
  }

  if (lower.includes('edu') || lower.includes('arxiv') || lower.includes('scholar')) {
    return 'academic';
  }

  return 'general';
}

export function extractTopicInfo(input: string): TopicInfo {
  return detectTopicType(input);
}

export function getFriendlyTopicName(topicInfo: TopicInfo): string {
  switch (topicInfo.type) {
    case 'url':
      return topicInfo.extractedTitle || topicInfo.sourceUrl || 'Web Resource';
    case 'book':
      return topicInfo.topic;
    case 'topic':
      return topicInfo.topic;
    default:
      return 'Topic';
  }
}

export function getCategoryLabel(category?: string): string {
  if (!category) return 'General';

  const labels = {
    technical: 'Technical',
    business: 'Business',
    academic: 'Academic',
    general: 'General',
  };

  return labels[category as keyof typeof labels] || category;
}
