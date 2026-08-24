export function mapRoomRow(roomRow, tags = [], keywords = []) {
  const roomType = String(roomRow.room_type || 'theoretical').toLowerCase() === 'practical'
    ? 'practical'
    : 'theoretical'

  return {
    id: roomRow.id,
    slug: roomRow.slug,
    category: roomRow.category,
    level: roomRow.level,
    levelTone: roomRow.level_tone,
    dotTone: roomRow.dot_tone,
    title: roomRow.title,
    description: roomRow.description,
    trainerId: roomRow.trainer_id || null,
    trainerName:
      [roomRow.trainer_first_name, roomRow.trainer_last_name].filter(Boolean).join(' ')
      || roomRow.trainer_username
      || null,
    xp: roomRow.xp,
    roomType,
    difficulty: roomRow.difficulty,
    estimateTime: roomRow.estimate_time,
    environment: roomRow.environment,
    categoryTag: roomRow.category_tag,
    tags,
    requiredKeywords: keywords,
    content: {
      markdown: roomRow.content_markdown || '',
      html: roomRow.content_html || '',
      missionOverview: roomRow.mission_overview || '',
      remediationProtocols: roomRow.remediation_protocols || '',
      vulnerabilityBriefing: {
        definition: roomRow.vulnerability_definition || '',
        impact: roomRow.vulnerability_impact || '',
      },
      technicalDeepDive: roomRow.technical_deep_dive || '',
      youtubeVideoUrl: roomRow.youtube_video_url || '',
      aiQuestionsEnabled: Boolean(roomRow.practical_ai_questions_enabled),
      attachment: roomRow.attachment_data
        ? {
            name: roomRow.attachment_name || 'room-file',
            type: roomRow.attachment_type || 'application/octet-stream',
            size: Number(roomRow.attachment_size || 0),
            dataUrl: roomRow.attachment_data,
          }
        : null,
      docker: {
        enabled: Boolean(roomRow.docker_enabled),
        image: roomRow.docker_image || '',
        containerPort: Number(roomRow.docker_container_port || 0) || '',
        protocol: roomRow.docker_protocol || 'http',
        timeoutMinutes: Number(roomRow.docker_timeout_minutes || 120),
        instructions: roomRow.docker_instructions || '',
        terminalTools: roomRow.docker_terminal_tools || '',
        exposeAttachmentToTerminal: Boolean(roomRow.docker_expose_attachment_to_terminal),
        terminalMode: roomRow.docker_terminal_mode || 'service',
        terminalImage: roomRow.docker_terminal_image || '',
      },
      questionsEnabled: Boolean(roomRow.questions_enabled),
      questions: (() => {
        try {
          const parsed = JSON.parse(roomRow.questions_json || '[]')
          return Array.isArray(parsed) ? parsed : []
        } catch {
          return []
        }
      })(),
    },
  }
}
