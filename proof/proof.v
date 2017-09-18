Require Import ZArith.

Variable eqdec : forall {A} (x y:A), {x=y}+{x<>y}.
Variable extensionality : forall A B (f g : A -> B), (forall x, f x = g x) -> f = g.

Variable Label : Set.
Variable Channel : Set.
Variable label : Channel -> Label.
Variable Value : Set.
Definition LabeledValueSet := Value -> Label -> bool.
Variable Key : Set.
Definition Store := Key -> LabeledValueSet.
Variable Code : Set.
Inductive Thread :=
  Thrd : Code -> Label -> Thread.
Definition Threads := Thread -> nat.
Definition ReadContinuation := LabeledValueSet -> Code.
Inductive Operation :=
  | Read : Key -> ReadContinuation -> Operation
  | Write : Key -> Value -> Code -> Operation
  | Send : Channel -> Value -> Code -> Operation
  | Fork : Code -> Code -> Operation
  | Stuck : Operation
  .
Inductive Event :=
  | Input : Thread -> Event
  | Output : Channel -> Value -> Event
  | Epsilon : Event
  .
Inductive State :=
  St : Store -> Threads -> State.
Variable run : Code -> Operation.
Variable Flows : Label -> Label -> Prop.
Variable Flows_dec : forall l1 l2, {Flows l1 l2}+{~Flows l1 l2}.
Variable Flows_trans : forall l1 l2 l3, Flows l1 l2 -> Flows l2 l3 -> Flows l1 l3.
Definition write (S:LabeledValueSet) v l : LabeledValueSet :=
  fun v' l' =>
    if eqdec v v' then
      if eqdec l l' then
        true
      else
        if Flows_dec l l' then
          false
        else
          S v' l'
    else
      if Flows_dec l l' then
        false
      else
        S v' l'
  .
Definition pS (S:LabeledValueSet) l : LabeledValueSet :=
  fun v l' =>
    if Flows_dec l' l then
      S v l'
    else
      false
  .
Definition thread_label t :=
  match t with
  | Thrd _ l => l
  end.
Definition pts (ts:Threads) l : Threads :=
  fun t =>
    if Flows_dec (thread_label t) l then
      ts t
    else
      0
  .
Definition px (x:Store) l : Store :=
  fun k =>
    pS (x k) l
  .
Definition pe e l : Event :=
  match e with
  | Input t =>
      if Flows_dec (thread_label t) l then
        e
      else
        Epsilon
  | Output ch v =>
      if Flows_dec (label ch) l then
        e
      else
        Epsilon
  | Epsilon =>
      Epsilon
  end
  .
Definition pX (X:State) l : State :=
  match X with
  | St x ts => St (px x l) (pts ts l)
  end
  .
Definition multi_one (t:Thread) : Threads :=
  fun t' =>
    if eqdec t' t then
      1
    else
      0
  .
Definition multi_two (t1:Thread) (t2:Thread) : Threads :=
  fun t' =>
    if eqdec t' t1 then
      1
    else if eqdec t' t2 then
      1
    else
      0
  .
Definition upd (x:Store) k S : Store :=
  fun k' =>
    if eqdec k k' then
      S
    else
      x k'
  .
Inductive Step : Store -> Thread -> Event -> State -> Prop :=
  | SSend : forall x c l ch v c',
      run c = Send ch v c' ->
      Flows l (label ch) ->
      Step x (Thrd c l) (Output ch v) (St x (multi_one (Thrd c' l)))
  | SRead : forall x c l f k,
      run c = Read k f ->
      Step x (Thrd c l) Epsilon (St x (multi_one (Thrd (f (pS (x k) l)) l)))
  | SWrite : forall x c l k v c',
      run c = Write k v c' ->
      Step x (Thrd c l) Epsilon (St (upd x k (write (x k) v l)) (multi_one (Thrd c' l)))
  | SFork : forall x c l c1 c2,
      run c = Fork c1 c2 ->
      Step x (Thrd c l) Epsilon (St x (multi_two (Thrd c1 l) (Thrd c2 l)))
  .
Definition multi_cons (ts:Threads) t : Threads :=
  fun t' =>
    if eqdec t t' then
      1 + ts t'
    else
      ts t'
  .
Definition multi_plus (ts1 ts2:Threads) : Threads :=
  fun t =>
    ts1 t + ts2 t
  .
Inductive SStep : State -> Event -> State -> Prop :=
  | SSStart : forall x ts t,
      SStep (St x ts) (Input t) (St x (multi_cons ts t))
  | SSSkip : forall X,
      SStep X Epsilon X
  | SSThread : forall x ts c l e x' ts',
      Step x (Thrd c l) e (St x' ts') ->
      SStep (St x (multi_cons ts (Thrd c l))) e (St x' (multi_plus ts ts'))
  .
Definition ConjectureTSNI := forall X1 l X2 e1 X1',
  pX X1 l = pX X2 l ->
  SStep X1 e1 X1' ->
  exists X2' e2,
      SStep X2 e2 X2'
    /\
      pX X1' l = pX X2' l
    /\
      pe e1 l = pe e2 l
  .

(****************)

Inductive LStep : Store -> Thread -> Event -> Label -> State -> Prop :=
  | LSSend : forall x c l ch v c' L,
      run c = Send ch v c' ->
      Flows l (label ch) ->
      Flows (label ch) L ->
      LStep x (Thrd c l) (Output ch v) L (St x (multi_one (Thrd c' l)))
  | LSCensor : forall x c l ch v c' L,
      run c = Send ch v c' ->
      Flows l (label ch) ->
      ~Flows (label ch) L ->
      LStep x (Thrd c l) Epsilon L (St x (multi_one (Thrd c' l)))
  | LSRead : forall x c l f k L,
      run c = Read k f ->
      LStep x (Thrd c l) Epsilon L (St x (multi_one (Thrd (f (pS (x k) l)) l)))
  | LSWrite : forall x c l k v c' L,
      run c = Write k v c' ->
      LStep x (Thrd c l) Epsilon L (St (upd x k (write (x k) v l)) (multi_one (Thrd c' l)))
  | LSFork : forall x c l c1 c2 L,
      run c = Fork c1 c2 ->
      LStep x (Thrd c l) Epsilon L (St x (multi_two (Thrd c1 l) (Thrd c2 l)))
  .
Inductive LSStep : State -> Event -> Label -> State -> Prop :=
  | LSSStart : forall x ts c l L,
      Flows l L ->
      LSStep (St x ts) (Input (Thrd c l)) L (St x (multi_cons ts (Thrd c l)))
  | LSSSkip : forall X L,
      LSStep X Epsilon L X
  | LSSThread : forall x ts c l e x' ts' L,
      LStep x (Thrd c l) e L (St x' ts') ->
      LSStep (St x (multi_cons ts (Thrd c l))) e L (St x' (multi_plus ts ts'))
  .

Lemma lemma_pts_multicons_1 : forall ts c l l',
  Flows l' l ->
  pts (multi_cons ts (Thrd c l')) l = multi_cons (pts ts l) (Thrd c l')
  .
Proof.
  intros.
  apply extensionality.
  intros.
  unfold pts, multi_cons, thread_label.
  destruct (eqdec (Thrd c l') x).
  -
    destruct x as (c2, l2).
    injection e; intros.
    rewrite <- H0.
    destruct (Flows_dec l' l); intuition.
  -
    reflexivity.
Qed.

Lemma lemma_pts_multicons_2 : forall ts c l l',
  ~Flows l' l ->
  pts (multi_cons ts (Thrd c l')) l = pts ts l
  .
Proof.
  intros.
  apply extensionality.
  intros.
  unfold pts, multi_cons, thread_label.
  destruct (eqdec (Thrd c l') x).
  -
    destruct x as (c2, l2).
    injection e; intros.
    rewrite <- H0.
    destruct (Flows_dec l' l); intuition.
  -
    reflexivity.
Qed.

Lemma lemma_pts_multiplus : forall ts1 ts2 l ,
  pts (multi_plus ts1 ts2) l = multi_plus (pts ts1 l) (pts ts2 l)
  .
Proof.
  intros.
  apply extensionality.
  intro t.
  destruct t as (c, l').
  unfold pts, multi_plus, thread_label. 
  destruct (Flows_dec l' l)
  ; reflexivity.
Qed.

Lemma lemma_multiplus_zero : forall ts,
  multi_plus ts (fun t => 0) = ts.
Proof.
  intros.
  unfold multi_plus.
  apply extensionality; intro t.
  omega.
Qed.

Lemma lemma_pts_multione : forall c l' l,
  Flows l' l ->
  pts (multi_one (Thrd c l')) l = multi_one (Thrd c l')
  .
  intros.
  unfold pts, multi_one, thread_label.
  apply extensionality.
  intro t.
  destruct t.
  destruct (Flows_dec l0 l); auto.
  destruct (eqdec (Thrd c0 l0) (Thrd c l')).
    congruence.
  trivial.
Qed.

Lemma lemma_pts_multitwo : forall c1 c2 l' l,
  Flows l' l ->
  pts (multi_two (Thrd c1 l') (Thrd c2 l')) l = multi_two (Thrd c1 l') (Thrd c2 l')
  .
  intros.
  unfold pts, multi_two, thread_label.
  apply extensionality.
  intro t.
  destruct t.
  destruct (Flows_dec l0 l); auto.
  destruct (eqdec (Thrd c l0) (Thrd c1 l')).
    congruence.
  destruct (eqdec (Thrd c l0) (Thrd c2 l')).
    congruence.
  trivial.
Qed.

Lemma lemma_invisibility_1 : forall x c l' e x' ts' l,
  ~Flows l' l ->
  Step x (Thrd c l') e (St x' ts') ->
  px x' l = px x l
  .
Proof.
  intros.
  rename H into T1, H0 into T2.
  inversion T2; auto.
  unfold px, pS, upd, write.
  apply extensionality.
  intro k'.
  apply extensionality.
  intro v'.
  apply extensionality.
  intro l''.
  destruct (eqdec k k')
  ; destruct (eqdec v v')
  ; destruct (eqdec l' l'')
  ; destruct (Flows_dec l'' l)
  ; destruct (Flows_dec l' l'')
  ; intuition (try congruence)
  ; pose (Flows_trans l' l'' l)
  ; intuition
  .
Qed.

Lemma lemma_invisibility_2 : forall x c l' e x' ts' l,
  ~Flows l' l ->
  Step x (Thrd c l') e (St x' ts') ->
  pe e l = Epsilon
  .
Proof.
  intros.
  rename H0 into T1.
  inversion T1; auto.
  simpl.
  destruct (Flows_dec (label ch) l); auto.
  pose (Flows_trans l' (label ch) l).
  intuition.  (* There's a contradiction. *)
Qed.

Lemma lemma_invisibility_3 : forall x c l' e x' ts' l,
  ~Flows l' l ->
  Step x (Thrd c l') e (St x' ts') ->
  pts ts' l = fun t => 0
  .
Proof.
  intros.
  rename H0 into T1.
  apply extensionality; intro t.
  destruct t as (c'', l'').
  unfold pts, thread_label.
  destruct (Flows_dec l'' l); auto.
  inversion T1.
  - unfold multi_one.
    destruct (eqdec (Thrd c'' l'') (Thrd c' l'))
    ; congruence.
  - unfold multi_one.
    destruct (eqdec (Thrd c'' l'') (Thrd (f0 (pS (x' k) l')) l'))
    ; congruence.
  - unfold multi_one.
    destruct (eqdec (Thrd c'' l'') (Thrd c' l'))
    ; congruence.
  - unfold multi_two.
    destruct (eqdec (Thrd c'' l'') (Thrd c1 l'))
    ; destruct (eqdec (Thrd c'' l'') (Thrd c2 l'))
    ; congruence.
Qed.

Lemma lemma_px_upd : forall l' l x k v,
  Flows l' l ->
  px (upd x k (write (x k) v l')) l = upd (px x l) k (write ((px x l) k) v l')
  .
Proof.
  intros.
  apply extensionality; intro k'.
  apply extensionality; intro v'.
  apply extensionality; intro l''.
  unfold px, upd, write, pS.
  destruct (eqdec k k')
  ; destruct (Flows_dec l'' l)
  ; destruct (eqdec v v')
  ; destruct (eqdec l' l'')
  ; destruct (Flows_dec l' l'')
  ; intuition congruence.
Qed.

Lemma lemma_read_helper : forall x' k l' l,
  Flows l' l ->
  pS (x' k) l' = pS (px x' l k) l'
  .
Proof.
  intros.
  apply extensionality.
  intro v.
  apply extensionality.
  intro l''.
  unfold pS, px, pS.
  destruct (Flows_dec l'' l'); destruct (Flows_dec l'' l); auto.
  pose (Flows_trans l'' l' l).
  intuition.  (* contradiction *)
Qed.

Theorem projection_1 : forall X e X' l,
  SStep X e X' ->
  LSStep (pX X l) (pe e l) l (pX X' l)
  .
Proof.
  destruct 1.
  -
    destruct t as (c, l').
    simpl.
    destruct (Flows_dec l' l).
    +
      rewrite lemma_pts_multicons_1; auto.
      apply LSSStart.
      auto.
    +
      rewrite lemma_pts_multicons_2; auto.
      apply LSSSkip.
  -
    eapply LSSSkip.
  -
    rename H into T1, l0 into l'.
    destruct (Flows_dec l' l) as [T2|T2]; cycle 1.
    +
      simpl.
      rewrite lemma_pts_multicons_2; auto.
      erewrite lemma_invisibility_1 with (x' := x'); cycle 1.
          exact T2.
        exact T1.
      erewrite lemma_invisibility_2; cycle 1.
          exact T2.
        exact T1.
      rewrite lemma_pts_multiplus.
      erewrite lemma_invisibility_3 with (ts' := ts'); cycle 1.
          exact T2.
        exact T1.
      rewrite lemma_multiplus_zero.
      apply LSSSkip.
    +
      simpl.
      rewrite lemma_pts_multicons_1; auto.
      rewrite lemma_pts_multiplus.
      apply LSSThread.
      inversion T1.
      *
        rewrite lemma_pts_multione; auto.
        simpl.
        destruct (Flows_dec (label ch) l).
          apply LSSend; auto.
        eapply LSCensor.
            exact H4.
          auto.
        auto.
      *
        rewrite lemma_pts_multione; auto.
        rewrite lemma_read_helper with (l := l); auto.
        apply LSRead.
        assumption.
      *
        rewrite lemma_pts_multione; auto.
        rewrite lemma_px_upd; auto.
        apply LSWrite.
        assumption.
      *
        rewrite lemma_pts_multitwo; auto.
        apply LSFork.
        assumption.
Qed.

Lemma apply_equation : forall {A}{B} {f g:A->B},
  f = g ->
  forall x,
  f x = g x.
  congruence.
Qed.

Theorem projection_2 : forall X l e1 X1,
  LSStep (pX X l) e1 l X1 ->
  exists X2 e2,
      SStep X e2 X2
    /\
      X1 = pX X2 l
    /\
      e1 = pe e2 l
  .
Proof.
  destruct X as (x, ts).
  inversion 1.
  -
    exists (St x (multi_cons ts (Thrd c l0))).
    exists (Input (Thrd c l0)).
    repeat split.
    + apply SSStart.
    + simpl.
      rewrite lemma_pts_multicons_1; auto.
    + simpl.
      destruct (Flows_dec l0 l); intuition.
  -
    do 2 eexists.
    split; [|split].
    + apply SSSkip.
    + reflexivity.
    + reflexivity.
  -
    rename H2 into T2, H5 into T3.
    assert (Flows l0 l).
      remember (apply_equation T2 (Thrd c l0)) as T4; clear HeqT4.
      unfold multi_cons, pts, thread_label in T4.
      destruct (eqdec (Thrd c l0) (Thrd c l0)); intuition.
      destruct (Flows_dec l0 l); auto.
      omega.
    pose (ts_ := fun t => if eqdec (Thrd c l0) t then ts t - 1 else ts t).
    assert (ts = multi_cons ts_ (Thrd c l0)) as T5.
      remember (apply_equation T2 (Thrd c l0)) as T4; clear HeqT4.
      unfold multi_cons, pts, thread_label in T4.
      destruct (eqdec (Thrd c l0) (Thrd c l0)); destruct (Flows_dec l0 l); intuition.
      unfold multi_cons, ts_.
      apply extensionality; intro t.
      destruct (eqdec (Thrd c l0) t) as [T5|]; auto.
      rewrite T5 in T4.
      omega.
    assert (pts ts_ l = ts0) as T6.
      apply extensionality; intro t.
      generalize (apply_equation T2 t).
      destruct t.
      unfold ts_, multi_cons, pts, thread_label.
      destruct (eqdec (Thrd c l0) (Thrd c0 l1)); try omega.
      destruct (Flows_dec l1 l); omega.
    inversion T3.
    +
      rewrite T5.
      do 2 eexists.
      repeat split.
      * apply SSThread.
        apply SSend.
          exact H12.
        assumption.
      * simpl.
        rewrite lemma_pts_multiplus.
        rewrite lemma_pts_multione; auto.
        rewrite T6.
        reflexivity.
      * unfold pe.
        destruct (Flows_dec (label ch) l); congruence.
    + (* This case is just a copy-paste of the previous case *)
      rewrite T5.
      do 2 eexists.
      repeat split.
      * apply SSThread.
        apply SSend.
          exact H12.
        assumption.
      * simpl.
        rewrite lemma_pts_multiplus.
        rewrite lemma_pts_multione; auto.
        rewrite T6.
        reflexivity.
      * unfold pe.
        destruct (Flows_dec (label ch) l); congruence.
    +
      rewrite T5.
      do 2 eexists.
      repeat split.
      * apply SSThread.
        apply SRead.
          exact H10.
      * simpl.
        rewrite lemma_pts_multiplus.
        rewrite lemma_pts_multione; auto.
        rewrite T6.
        rewrite <- lemma_read_helper with (l := l); auto.
      * reflexivity.
    +
      rewrite T5.
      do 2 eexists.
      repeat split.
      * apply SSThread.
        apply SWrite.
          exact H10.
      * simpl.
        rewrite lemma_pts_multiplus.
        rewrite lemma_pts_multione; auto.
        rewrite T6.
        rewrite <- lemma_px_upd; auto.
      * reflexivity.
    +
      rewrite T5.
      do 2 eexists.
      repeat split.
      * apply SSThread.
        apply SFork.
          exact H10.
      * simpl.
        rewrite lemma_pts_multiplus.
        rewrite lemma_pts_multitwo; auto.
        rewrite T6.
        reflexivity.
      * reflexivity.
Qed.

Theorem tsni : ConjectureTSNI.
  unfold ConjectureTSNI.
  intros.
  rename H into T1, H0 into T2.
  apply projection_2.
  rewrite <- T1.
  apply projection_1.
  exact T2.
Qed.
