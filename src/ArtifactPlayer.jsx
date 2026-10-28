import {useMemo, useRef, useEffect} from 'react';
import {X, Check} from '@phosphor-icons/react';
import {buildArtifactDocument} from './artifact-runtime.js';

export function CompetitionModal({title, children, onClose, wide = false}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current; dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'wide competition-wide' : ''}`} onCancel={onClose}
    onClick={event => {if (event.target === ref.current) onClose();}}>
    <div className="modal-head"><span>{title}</span><button onClick={onClose} aria-label="닫기"><X size={21}/></button></div>
    {children}
  </dialog>;
}

export function ArtifactPlayer({work, side, onClose, onComplete}) {
  const document = useMemo(() => buildArtifactDocument(work.artifact.source), [work.artifact.source]);
  const label = side ? `작품 ${side}` : work.title;
  return <CompetitionModal title={`${label} · 실행 결과`} wide onClose={onClose}>
    <iframe className="artifact-frame" title={`${label} 실행 화면`} sandbox="allow-scripts" referrerPolicy="no-referrer"
      allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
      srcDoc={document}/>
    <div className="artifact-footer"><p>직접 조작한 뒤 기능과 사용성을 확인하세요. 앱의 메시지는 평가 결과로 자동 인정하지 않습니다.</p>
      <button className="primary" onClick={onComplete}><Check size={17}/>직접 체험 완료</button></div>
    <p className="artifact-isolation-note">브라우저 sandbox와 CSP를 적용한 로컬 미리보기입니다. 독립 서버 격리나 완전한 네트워크 차단을 보장하지 않습니다.</p>
  </CompetitionModal>;
}
