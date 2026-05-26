-- Migration 009: yihai-private 私有桶 + RLS 策略
-- 日期：2026-05-26
-- 用途：家人录音、家庭视频的隐私存储；用户只能访问自己 user_id/ 下的文件

-- 建桶（已通过 MCP 执行，此处留档）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'yihai-private',
  'yihai-private',
  false,
  524288000,  -- 500MB 单文件上限
  ARRAY[
    'image/jpeg','image/png','image/webp','image/gif',
    'audio/mpeg','audio/mp4','audio/wav','audio/ogg',
    'video/mp4','video/quicktime','video/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS 策略：用户只能操作自己 {user_id}/ 前缀下的对象
CREATE POLICY "priv_user_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'yihai-private'
    AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "priv_user_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'yihai-private'
    AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "priv_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'yihai-private'
    AND (storage.foldername(name))[1] = auth.uid()::text);
