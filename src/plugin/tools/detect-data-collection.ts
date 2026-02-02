/**
 * Tool: detect_data_collection
 * Finds all points where the app collects user data
 */

export interface DataPoint {
  screenId: string;
  screenName: string;
  nodeId: string;
  nodeName: string;
  dataType: string;
  category: 'personal' | 'sensitive' | 'preference' | 'content';
}

export interface DataCollectionReport {
  dataPoints: DataPoint[];
  summary: {
    totalInputs: number;
    personalData: string[];
    sensitiveData: string[];
    preferenceData: string[];
    contentData: string[];
    screensByDataCollection: Array<{
      screenName: string;
      dataTypes: string[];
    }>;
  };
  privacyNotes: string[];
}

export function detectDataCollection(): DataCollectionReport {
  const page = figma.currentPage;
  const frames = page.children.filter(
    node => node.type === 'FRAME' || node.type === 'COMPONENT'
  ) as FrameNode[];

  const dataPoints: DataPoint[] = [];
  const personalData = new Set<string>();
  const sensitiveData = new Set<string>();
  const preferenceData = new Set<string>();
  const contentData = new Set<string>();
  const screenDataMap = new Map<string, Set<string>>();

  for (const frame of frames) {
    const screenData = new Set<string>();

    function processNode(n: SceneNode) {
      const nameLower = n.name.toLowerCase();
      const dataInfo = detectDataType(nameLower);

      if (dataInfo) {
        dataPoints.push({
          screenId: frame.id,
          screenName: frame.name,
          nodeId: n.id,
          nodeName: n.name,
          dataType: dataInfo.type,
          category: dataInfo.category,
        });

        screenData.add(dataInfo.type);

        switch (dataInfo.category) {
          case 'personal':
            personalData.add(dataInfo.type);
            break;
          case 'sensitive':
            sensitiveData.add(dataInfo.type);
            break;
          case 'preference':
            preferenceData.add(dataInfo.type);
            break;
          case 'content':
            contentData.add(dataInfo.type);
            break;
        }
      }

      // Process children
      if ('children' in n) {
        for (const child of (n as FrameNode).children) {
          processNode(child);
        }
      }
    }

    for (const child of frame.children) {
      processNode(child);
    }

    if (screenData.size > 0) {
      screenDataMap.set(frame.name, screenData);
    }
  }

  // Generate privacy notes
  const privacyNotes: string[] = [];
  if (sensitiveData.size > 0) {
    privacyNotes.push(`App collects sensitive data: ${Array.from(sensitiveData).join(', ')}. Ensure proper encryption and secure storage.`);
  }
  if (personalData.has('email_address')) {
    privacyNotes.push('Email collection requires consent under GDPR. Consider adding consent checkbox.');
  }
  if (personalData.has('phone_number')) {
    privacyNotes.push('Phone number collection may require additional privacy disclosures.');
  }
  if (contentData.has('journal_entry') || contentData.has('mood_data')) {
    privacyNotes.push('Health/wellness data may be subject to additional regulations (HIPAA, etc.)');
  }

  return {
    dataPoints,
    summary: {
      totalInputs: dataPoints.length,
      personalData: Array.from(personalData),
      sensitiveData: Array.from(sensitiveData),
      preferenceData: Array.from(preferenceData),
      contentData: Array.from(contentData),
      screensByDataCollection: Array.from(screenDataMap.entries()).map(([name, types]) => ({
        screenName: name,
        dataTypes: Array.from(types),
      })),
    },
    privacyNotes,
  };
}

function detectDataType(name: string): { type: string; category: 'personal' | 'sensitive' | 'preference' | 'content' } | null {
  // Personal data
  if (/email|e-mail/i.test(name)) {
    return { type: 'email_address', category: 'personal' };
  }
  if (/phone|tel|mobile/i.test(name)) {
    return { type: 'phone_number', category: 'personal' };
  }
  if (/name|first.?name|last.?name|full.?name/i.test(name)) {
    return { type: 'user_name', category: 'personal' };
  }
  if (/address|street|city|zip|postal/i.test(name)) {
    return { type: 'physical_address', category: 'personal' };
  }
  if (/birth|dob|age/i.test(name)) {
    return { type: 'date_of_birth', category: 'personal' };
  }

  // Sensitive data
  if (/password|pwd|secret/i.test(name)) {
    return { type: 'password', category: 'sensitive' };
  }
  if (/card|credit|payment|cvv|expir/i.test(name)) {
    return { type: 'payment_info', category: 'sensitive' };
  }
  if (/ssn|social.?security/i.test(name)) {
    return { type: 'ssn', category: 'sensitive' };
  }

  // Preference data
  if (/preference|setting|option|toggle/i.test(name)) {
    return { type: 'user_preference', category: 'preference' };
  }
  if (/notification|alert/i.test(name)) {
    return { type: 'notification_preference', category: 'preference' };
  }

  // Content data
  if (/journal|diary|note|entry/i.test(name)) {
    return { type: 'journal_entry', category: 'content' };
  }
  if (/mood|feeling|emotion/i.test(name)) {
    return { type: 'mood_data', category: 'content' };
  }
  if (/message|comment|post|reply/i.test(name)) {
    return { type: 'user_content', category: 'content' };
  }
  if (/search/i.test(name)) {
    return { type: 'search_query', category: 'content' };
  }

  // Generic input
  if (/input|field|text.?box|textarea/i.test(name)) {
    return { type: 'text_input', category: 'content' };
  }

  return null;
}
