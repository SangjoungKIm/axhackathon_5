"""Resolve one physical map cell by summed observations, never by track labels."""

POLICY='sum_unique_track_votes_dirty_on_tie_v1'
CLASSES=('clean','dirty','crack')
DIRTY_CLASSES=('bird','dust','leaf')


def cell_consensus(records):
    unique={}
    for index,record in enumerate(records):
        identity=record.get('uid',record.get('track_id',record.get('id')))
        key=str(identity) if identity is not None else f'index:{index}'
        if key not in unique:unique[key]=record
    votes=dict.fromkeys(CLASSES,0)
    for record in unique.values():
        counts=record.get('votes') or {}
        for name in CLASSES:
            value=max(0,int(counts.get(name,0)))
            # Reference-format sessions record raw crack classifications separately
            # from seg hits; raw crack predictions must not become confirmed votes.
            if name=='crack' and isinstance(record.get('seg'),dict):
                value=min(value,max(0,int(record['seg'].get('hits',0))))
            votes[name]+=value
    maximum=max(votes.values())
    if not unique:state='undetected'
    elif maximum==0:state='insufficient'
    else:
        # Dirty wins any equal maximum; verified crack wins a tie with clean.
        state=max(CLASSES,key=lambda name:(votes[name],{'clean':0,'crack':1,'dirty':2}[name]))
    classes={c for r in unique.values() if (r.get('votes') or {}).get('dirty',0)>0
             for c in r.get('dirty_classes',[]) if c in DIRTY_CLASSES}
    classes=[c for c in DIRTY_CLASSES if c in classes] if state in {'dirty','crack'} else []
    return {'status':state,'votes':votes,'vote_tie':maximum>0 and sum(v==maximum for v in votes.values())>1,
            'dirty_classes':classes,'dirty_label':('dirty_'+classes[0] if len(classes)==1 else 'dirty_'+str(len(classes))) if classes else None,
            'with_dirty':state=='crack' and votes['dirty']>0,'decision_policy':POLICY,
            'inconsistent':False,'needs_review':False}


def update_layout_consensus(layout,by_uid=None):
    """Keep geometry and raw member evidence intact; update automatic cell states."""
    for panel in layout.get('panels',[]):
        records=[]
        for m in panel.get('members',[]):
            records.append((by_uid or {}).get(m.get('uid'),m))
        panel['track_states_differ']=len({r.get('status') for r in records if r.get('status') not in {'insufficient','undetected'}})>1
        panel.update(cell_consensus(records))
    summary=layout.setdefault('summary',{})
    for state in ('clean','dirty','crack','insufficient','undetected'):
        summary[state]=sum(p['status']==state for p in layout.get('panels',[]))
    summary['inconsistent']=0
    summary['detected']=len(layout.get('panels',[]))-summary['undetected']
    for row in layout.get('rows',[]):
        panels=[p for p in layout['panels'] if p['row']==row['row']]
        for state in ('clean','dirty','crack','insufficient','undetected'):
            row[state]=sum(p['status']==state for p in panels)
        row['detected']=len(panels)-row['undetected']
    layout['decision_policy']=POLICY
    return layout
