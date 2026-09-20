/** Layout-only styles; controls and interaction chrome come from DSH primitives. */
export const triggerStyles = `
.dsh-notebook-trigger{display:inline-flex;align-self:stretch;align-items:center;justify-content:center;gap:8px;width:36px;height:36px;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;cursor:pointer}
.dsh-notebook-trigger[data-wide=true]{width:100%;height:42px;justify-content:flex-start;padding-inline:8px}.dsh-notebook-trigger span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;
export const styles = `
.dsh-notebook{container-type:inline-size;display:flex;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.dsh-notebook *{box-sizing:border-box}.dsh-notebook h2,.dsh-notebook h3,.dsh-notebook p{margin:0}
.dsh-notebook-nav{display:flex;width:190px;min-width:160px;flex:none;flex-direction:column;gap:16px;padding:16px;border-right:1px solid var(--dsw-alias-border-l2);overflow:auto}
.dsh-notebook-heading,.dsh-notebook-toolbar,.dsh-notebook-row,.dsh-notebook-actions,.dsh-notebook-meta,.dsh-notebook-pills{display:flex;align-items:center;gap:8px}
.dsh-notebook-heading{justify-content:space-between}.dsh-notebook-heading h2{font-size:16px;line-height:24px}.dsh-notebook-heading h3{font-size:13px;line-height:20px}
.dsh-notebook-section{display:flex;flex-direction:column;gap:8px}.dsh-notebook-pills{flex-wrap:wrap}.dsh-notebook-nav-list{display:flex;flex-direction:column;gap:2px}
.dsh-notebook-nav-item{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer}
.dsh-notebook-nav-item[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-notebook-list-pane{display:flex;width:300px;min-width:240px;flex:none;flex-direction:column;border-right:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-list-head{display:flex;flex-direction:column;gap:10px;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-list{display:flex;min-height:0;flex:1;flex-direction:column;overflow:auto}
.dsh-notebook-list-item{display:flex;flex:none;flex-direction:column;gap:5px;padding:12px 16px;border:0;border-bottom:1px solid var(--dsw-alias-border-l2);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-notebook-list-item[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover)}.dsh-notebook-list-item h3{font-size:14px;line-height:20px;overflow-wrap:anywhere}.dsh-notebook-list-item p{display:-webkit-box;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2}
.dsh-notebook-detail{display:flex;min-width:0;min-height:0;flex:1;flex-direction:column}.dsh-notebook-detail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-detail-head>div:first-child{min-width:0}.dsh-notebook-detail-head h2{font-size:18px;line-height:26px;overflow-wrap:anywhere}.dsh-notebook-meta{flex-wrap:wrap;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}
.dsh-notebook-detail-body{display:flex;min-height:0;flex:1;flex-direction:column;gap:16px;padding:16px;overflow:auto}.dsh-notebook-field{display:flex;flex-direction:column;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-notebook-field textarea,.dsh-notebook-field select{width:100%;min-width:0;padding:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit}.dsh-notebook-field textarea{min-height:300px;resize:vertical}
.dsh-notebook-preview{min-height:240px;padding:4px}.dsh-notebook-empty{display:flex;min-height:220px;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsh-notebook-empty h3{color:var(--dsw-alias-label-primary);font-size:15px}.dsh-notebook-empty svg{opacity:.75}
.dsh-notebook-actions{flex-wrap:wrap}.dsh-notebook-images{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.dsh-notebook-image{display:flex;min-width:0;flex-direction:column;gap:6px}.dsh-notebook-image img{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--dsw-alias-bg-layer-2)}.dsh-notebook-image span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-secondary);font-size:11px}
.dsh-notebook-history{display:flex;flex-direction:column;gap:8px}.dsh-notebook-history-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-block:8px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-notebook-error{padding:10px;color:var(--dsw-alias-label-error);background:var(--dsw-alias-state-error-secondary);font-size:12px}.dsh-notebook-modal-body{display:flex;flex-direction:column;gap:12px}.dsh-notebook-back{display:none}
.dsh-notebook-tool-card{display:flex;max-width:520px;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}.dsh-notebook-tool-card>div{min-width:0}.dsh-notebook-tool-card strong,.dsh-notebook-tool-card span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-notebook-tool-card span{color:var(--dsw-alias-label-secondary);font-size:12px}
@container(max-width:760px){.dsh-notebook-nav{width:154px;min-width:154px}.dsh-notebook-list-pane{width:auto;min-width:0;flex:1}.dsh-notebook-detail{display:none}.dsh-notebook[data-detail=true] .dsh-notebook-nav,.dsh-notebook[data-detail=true] .dsh-notebook-list-pane{display:none}.dsh-notebook[data-detail=true] .dsh-notebook-detail{display:flex}.dsh-notebook-back{display:inline-flex}}
@container(max-width:420px){.dsh-notebook-nav{display:none}.dsh-notebook-list-pane{width:100%}.dsh-notebook[data-detail=true] .dsh-notebook-list-pane{display:none}.dsh-notebook-list-head,.dsh-notebook-detail-head,.dsh-notebook-detail-body{padding:12px}}
`;
export const toolCardStyles = `
.dsh-notebook-tool-card{display:flex;max-width:520px;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-notebook-tool-card>svg{flex:none}.dsh-notebook-tool-card>div{min-width:0;flex:1}.dsh-notebook-tool-card strong,.dsh-notebook-tool-card span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dsh-notebook-tool-card span{color:var(--dsw-alias-label-secondary);font-size:12px}
`;
